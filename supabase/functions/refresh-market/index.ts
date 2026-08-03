// Supabase Edge Function: refresh-market
//
// Pulls outside market reference prices and writes them into
// public.market_snapshots. This is reference data from third parties. It has
// nothing to do with public.price_history, which is internal merchant listing
// data and is never read or written here.
//
// Three sources, each isolated in its own try/catch so one bad source cannot
// stop the others:
//   1. Coorg Planters' Association JSON API      source 'cpa'
//   2. Coffee Board of India home page HTML      source 'coffee_board'
//   3. data.gov.in mandi prices (optional)       source 'agmarknet'
//
// Secrets required (set via the Supabase dashboard or CLI, never committed):
//   MARKET_REFRESH_SECRET  caller must send it as the x-refresh-secret header.
//                          Without this set the function refuses to run, so it
//                          is never callable anonymously.
//   DATA_GOV_IN_API_KEY    optional; when absent source 3 is skipped.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const REFRESH_SECRET = Deno.env.get("MARKET_REFRESH_SECRET") ?? "";
const DATA_GOV_IN_API_KEY = Deno.env.get("DATA_GOV_IN_API_KEY") ?? "";

const admin = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

// ---------------------------------------------------------------------------
// Row shape
// ---------------------------------------------------------------------------

type ValidationStatus = "ok" | "held" | "flagged";

interface SnapshotRow {
  source: string;
  crop_key: string;
  display_name: string;
  unit: string;
  contract_month: string;
  // Not nullable. source_date is part of the unique index, and Postgres treats
  // NULLs in a unique index as distinct, so a null here would never conflict
  // and every run would insert a fresh duplicate. Callers must skip a row whose
  // date will not parse rather than pass null through.
  source_date: string;
  price_min: number | null;
  price_max: number | null;
  change_amount: number | null;
  change_direction: string | null;
  validation_status: ValidationStatus;
  validation_note: string | null;
  raw: unknown;
}

// The conflict target is (source, crop_key, contract_month, source_date). On a
// hit we update only the columns the spec names. created_at and app_crop_names
// are deliberately left alone, which a blanket upsert could not guarantee, so
// the existence check is done explicitly.
async function writeSnapshot(
  client: SupabaseClient,
  row: SnapshotRow
): Promise<void> {
  const found = await client
    .from("market_snapshots")
    .select("id")
    .eq("source", row.source)
    .eq("crop_key", row.crop_key)
    .eq("contract_month", row.contract_month)
    .eq("source_date", row.source_date)
    .maybeSingle();
  if (found.error) throw new Error(`lookup failed: ${found.error.message}`);

  const existing = found.data as { id: string } | null;
  const fetchedAt = new Date().toISOString();

  if (existing) {
    const { error } = await client
      .from("market_snapshots")
      .update({
        price_min: row.price_min,
        price_max: row.price_max,
        change_amount: row.change_amount,
        change_direction: row.change_direction,
        validation_status: row.validation_status,
        validation_note: row.validation_note,
        raw: row.raw,
        fetched_at: fetchedAt,
      })
      .eq("id", existing.id);
    if (error) throw new Error(`update failed: ${error.message}`);
    return;
  }

  const { error } = await client
    .from("market_snapshots")
    .insert({ ...row, fetched_at: fetchedAt });
  if (error) throw new Error(`insert failed: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Small parsing helpers
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const cleaned = value.replace(/,/g, "").replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed === "" ? null : trimmed;
  }
  if (typeof value === "number") return String(value);
  return null;
}

// CPA sends ISO dates already, so this only guards the format.
function isoDate(value: unknown): string | null {
  const text = toText(value);
  if (text === null) return null;
  const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

// The Coffee Board page and the data.gov.in records both use DD/MM/YYYY.
function dmyToIsoDate(value: unknown): string | null {
  const text = toText(value);
  if (text === null) return null;
  const match = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return null;
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  return `${match[3]}-${month}-${day}`;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round2(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// ---------------------------------------------------------------------------
// Source 1: Coorg Planters' Association
// ---------------------------------------------------------------------------

const CPA_URL = "https://api.cpa.org.in/v1/crop/prices";

interface CpaCropMeta {
  cropKey: string;
  displayName: string;
  kgPerUnit: number;
  unit: string;
  bandMinPerKg: number;
  bandMaxPerKg: number;
}

// The unit_value field CPA returns is wrong for cardamom (it reports 50 while
// the price is per kilogram, understating the value 50 fold), so the quantity
// each quoted price covers is fixed here instead of read from the response.
const CPA_CROPS: Record<string, CpaCropMeta> = {
  "arabica-parchment": {
    cropKey: "arabica_parchment",
    displayName: "Arabica Parchment",
    kgPerUnit: 50,
    unit: "INR/50kg",
    bandMinPerKg: 160,
    bandMaxPerKg: 1600,
  },
  "arabica-cherry": {
    cropKey: "arabica_cherry",
    displayName: "Arabica Cherry",
    kgPerUnit: 50,
    unit: "INR/50kg",
    bandMinPerKg: 80,
    bandMaxPerKg: 1000,
  },
  "robusta-parchment": {
    cropKey: "robusta_parchment",
    displayName: "Robusta Parchment",
    kgPerUnit: 50,
    unit: "INR/50kg",
    bandMinPerKg: 100,
    bandMaxPerKg: 1200,
  },
  "robusta-cherry": {
    cropKey: "robusta_cherry",
    displayName: "Robusta Cherry",
    kgPerUnit: 50,
    unit: "INR/50kg",
    bandMinPerKg: 60,
    bandMaxPerKg: 800,
  },
  pepper: {
    cropKey: "pepper",
    displayName: "Pepper",
    kgPerUnit: 1,
    unit: "INR/kg",
    bandMinPerKg: 200,
    bandMaxPerKg: 3000,
  },
  cardamom: {
    cropKey: "cardamom",
    displayName: "Cardamom",
    kgPerUnit: 1,
    unit: "INR/kg",
    bandMinPerKg: 500,
    bandMaxPerKg: 15000,
  },
};

interface CpaSummary {
  rows_written: number;
  rows_held: number;
  rows_flagged: number;
  rows_skipped: number;
  error: string | null;
}

async function runCpa(
  client: SupabaseClient,
  agmarknetPerKg: Map<string, number>,
  summary: CpaSummary,
  warnings: string[]
): Promise<void> {
  const response = await fetch(CPA_URL, {
    headers: {
      Origin: "https://cpa.org.in",
      Referer: "https://cpa.org.in/",
      "User-Agent": "Mozilla/5.0",
    },
  });
  if (!response.ok) {
    throw new Error(`cpa responded ${response.status} ${response.statusText}`);
  }

  const payload: unknown = await response.json();
  const envelope = asRecord(payload);
  if (envelope === null || !Array.isArray(envelope.data)) {
    throw new Error(
      `cpa returned an unexpected shape, expected an object with a data array, got: ${JSON.stringify(payload).slice(0, 500)}`
    );
  }

  for (const entry of envelope.data) {
    const record = asRecord(entry);
    if (record === null) {
      const message = "cpa: skipped an entry that is not an object";
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const id = toText(record.id);
    if (id === null) {
      const message = "cpa: skipped an entry with no id";
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    // An id outside the map is expected rather than a fault, so it stays a
    // console.warn and is not counted as a skipped row.
    const meta = CPA_CROPS[id];
    if (!meta) {
      console.warn(`cpa id not in the crop map, skipping: ${id}`);
      continue;
    }

    const sourceDate = isoDate(record.date);
    if (sourceDate === null) {
      const message = `cpa: skipped ${id}, unparsable date ${JSON.stringify(record.date)}`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const priceMin = toNumber(record.price_min);
    // price_max is null whenever CPA quotes a single price rather than a band.
    // It is stored as null and price_min carries that single price.
    const priceMax = toNumber(record.price_max);

    let status: ValidationStatus = "ok";
    let note: string | null = null;

    // Step 1, hard band. Always runs. Both bounds are checked when the source
    // quotes a range. price_max is null when it quotes a single price, and
    // then only price_min is there to check.
    let perKg: number | null = null;
    if (priceMin === null) {
      status = "held";
      note = `price_min missing for cpa id ${id}`;
    } else {
      perKg = priceMin / meta.kgPerUnit;
      const failedBounds: string[] = [];

      if (perKg < meta.bandMinPerKg || perKg > meta.bandMaxPerKg) {
        failedBounds.push(
          `price_min ${priceMin} ${meta.unit} computes to ${round2(perKg)} INR per kg`
        );
      }

      if (priceMax !== null) {
        const maxPerKg = priceMax / meta.kgPerUnit;
        if (maxPerKg < meta.bandMinPerKg || maxPerKg > meta.bandMaxPerKg) {
          failedBounds.push(
            `price_max ${priceMax} ${meta.unit} computes to ${round2(maxPerKg)} INR per kg`
          );
        }
      }

      if (failedBounds.length > 0) {
        status = "held";
        note =
          `${failedBounds.join("; ")}, ` +
          `outside the expected band ${meta.bandMinPerKg} to ${meta.bandMaxPerKg} INR per kg`;
      }
    }

    // Step 2, cross-check against the mandi price. Pepper and cardamom only,
    // and only when source 3 actually returned data for that commodity. A row
    // already held stays held, because held is the stricter outcome.
    if (status === "ok" && perKg !== null) {
      const reference = agmarknetPerKg.get(meta.cropKey);
      if (reference !== undefined && reference > 0) {
        const ratio = perKg / reference;
        if (ratio < 0.5 || ratio > 2.0) {
          status = "flagged";
          note =
            `cpa ${round2(perKg)} INR per kg against agmarknet ${round2(reference)} INR per kg, ` +
            `ratio ${round2(ratio)}`;
        }
      }
    }

    await writeSnapshot(client, {
      source: "cpa",
      crop_key: meta.cropKey,
      display_name: meta.displayName,
      unit: meta.unit,
      contract_month: "",
      source_date: sourceDate,
      price_min: priceMin,
      price_max: priceMax,
      change_amount: toNumber(record.price_diff),
      change_direction: toText(record.price_change),
      validation_status: status,
      validation_note: note,
      raw: record,
    });

    summary.rows_written += 1;
    if (status === "held") summary.rows_held += 1;
    if (status === "flagged") summary.rows_flagged += 1;
  }
}

// ---------------------------------------------------------------------------
// Source 2: Coffee Board of India
// ---------------------------------------------------------------------------

const COFFEE_BOARD_URL = "https://coffeeboard.gov.in/";

// Every id below was read from the live page. The Coffee Board's own naming is
// internally inconsistent: arabica month 3 reads its value from month1value_0
// and robusta month 2 reads from lblmonth2value_0. That crossover is verified
// and must not be tidied up into something symmetrical.
const ICO_DATE_ID = "GridView1_Label2_0";
const ICO_OTHER_MILDS_ID = "GridView1_lblothermilds_0";
const ICO_ROBUSTAS_ID = "GridView1_lblrobustas_0";
const FUTURES_DATE_ID = "GridView1_lbldate1_0";

interface FuturesMonthIds {
  labelId: string;
  valueId: string;
}

const ICE_ARABICA_MONTHS: FuturesMonthIds[] = [
  { labelId: "GridView1_lblmonth_0", valueId: "GridView1_lblmonthvalue_0" },
  { labelId: "GridView1_lblmonth1_0", valueId: "GridView1_lblmonth1value_0" },
  { labelId: "GridView1_lblmonth2_0", valueId: "GridView1_month1value_0" },
];

const LIFFE_ROBUSTA_MONTHS: FuturesMonthIds[] = [
  { labelId: "GridView1_month_0", valueId: "GridView1_monthvalue_0" },
  { labelId: "GridView1_month1_0", valueId: "GridView1_lblmonth2value_0" },
  { labelId: "GridView1_month2_0", valueId: "GridView1_month2value_0" },
];

const ICE_ARABICA_MIN = 50;
const ICE_ARABICA_MAX = 1000;
const LIFFE_ROBUSTA_MIN = 500;
const LIFFE_ROBUSTA_MAX = 20000;

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_full, code: string) =>
      String.fromCharCode(Number(code))
    );
}

function spanText(html: string, id: string): string | null {
  const pattern = new RegExp(
    `id\\s*=\\s*["']${id}["'][^>]*>([\\s\\S]*?)<\\/span>`,
    "i"
  );
  const match = html.match(pattern);
  if (!match) return null;
  const text = decodeEntities(match[1].replace(/<[^>]*>/g, ""))
    .replace(/\s+/g, " ")
    .trim();
  return text === "" ? null : text;
}

interface CoffeeBoardSummary {
  rows_written: number;
  rows_held: number;
  rows_skipped: number;
  error: string | null;
}

async function runCoffeeBoard(
  client: SupabaseClient,
  summary: CoffeeBoardSummary,
  warnings: string[]
): Promise<void> {
  const response = await fetch(COFFEE_BOARD_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(
      `coffee board responded ${response.status} ${response.statusText}`
    );
  }
  const html = await response.text();

  const icoDateRaw = spanText(html, ICO_DATE_ID);
  const futuresDateRaw = spanText(html, FUTURES_DATE_ID);
  const icoDate = dmyToIsoDate(icoDateRaw);
  const futuresDate = dmyToIsoDate(futuresDateRaw);

  // The two ICO indicator prices. They carry no futures month.
  const icoRows: Array<{ cropKey: string; displayName: string; id: string }> = [
    {
      cropKey: "ico_other_milds",
      displayName: "ICO Other Milds",
      id: ICO_OTHER_MILDS_ID,
    },
    {
      cropKey: "ico_robustas",
      displayName: "ICO Robustas",
      id: ICO_ROBUSTAS_ID,
    },
  ];

  for (const row of icoRows) {
    if (icoDate === null) {
      const message = `coffee_board: skipped ${row.cropKey}, unparsable ICO date from ${ICO_DATE_ID} ${JSON.stringify(icoDateRaw)}`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const rawValue = spanText(html, row.id);
    const value = toNumber(rawValue);

    // ICO is quoted in the same unit as ICE arabica, so it is held against the
    // same band. The two are deliberately coupled to one pair of constants so
    // they cannot drift apart.
    let status: ValidationStatus = "ok";
    let note: string | null = null;
    if (value === null) {
      status = "held";
      note = `element ${row.id} produced no numeric value, page structure may have changed`;
    } else if (value < ICE_ARABICA_MIN || value > ICE_ARABICA_MAX) {
      status = "held";
      note =
        `element ${row.id} produced ${value} USc/lb, ` +
        `outside the expected band ${ICE_ARABICA_MIN} to ${ICE_ARABICA_MAX}, page structure may have changed`;
    }

    await writeSnapshot(client, {
      source: "coffee_board",
      crop_key: row.cropKey,
      display_name: row.displayName,
      unit: "USc/lb",
      contract_month: "",
      source_date: icoDate,
      price_min: value,
      price_max: null,
      change_amount: null,
      change_direction: null,
      validation_status: status,
      validation_note: note,
      raw: {
        date_element_id: ICO_DATE_ID,
        date_raw: icoDateRaw,
        value_element_id: row.id,
        value_raw: rawValue,
      },
    });

    summary.rows_written += 1;
    if (status === "held") summary.rows_held += 1;
  }

  const futuresMarkets: Array<{
    cropKey: string;
    displayName: string;
    unit: string;
    months: FuturesMonthIds[];
    bandMin: number;
    bandMax: number;
  }> = [
    {
      cropKey: "ice_arabica",
      displayName: "ICE New York Arabica",
      unit: "USc/lb",
      months: ICE_ARABICA_MONTHS,
      bandMin: ICE_ARABICA_MIN,
      bandMax: ICE_ARABICA_MAX,
    },
    {
      cropKey: "liffe_robusta",
      displayName: "LIFFE London Robusta",
      unit: "USD/ton",
      months: LIFFE_ROBUSTA_MONTHS,
      bandMin: LIFFE_ROBUSTA_MIN,
      bandMax: LIFFE_ROBUSTA_MAX,
    },
  ];

  for (const market of futuresMarkets) {
    for (const month of market.months) {
      if (futuresDate === null) {
        const message = `coffee_board: skipped ${market.cropKey} month from ${month.labelId}, unparsable futures date from ${FUTURES_DATE_ID} ${JSON.stringify(futuresDateRaw)}`;
        console.error(message);
        warnings.push(message);
        summary.rows_skipped += 1;
        continue;
      }

      const contractMonth = spanText(html, month.labelId);
      if (contractMonth === null) {
        // The month label is part of the row key, so without it there is no
        // way to write a distinct row. Reported loudly rather than absorbed.
        const message = `coffee_board: skipped ${market.cropKey} month, label element ${month.labelId} is missing`;
        console.error(message);
        warnings.push(message);
        summary.rows_skipped += 1;
        continue;
      }

      const rawValue = spanText(html, month.valueId);
      const value = toNumber(rawValue);

      let status: ValidationStatus = "ok";
      let note: string | null = null;
      if (value === null) {
        status = "held";
        note = `element ${month.valueId} produced no numeric value, page structure may have changed`;
      } else if (value < market.bandMin || value > market.bandMax) {
        status = "held";
        note =
          `element ${month.valueId} produced ${value} ${market.unit}, ` +
          `outside the expected band ${market.bandMin} to ${market.bandMax}, page structure may have changed`;
      }

      await writeSnapshot(client, {
        source: "coffee_board",
        crop_key: market.cropKey,
        display_name: market.displayName,
        unit: market.unit,
        contract_month: contractMonth,
        source_date: futuresDate,
        price_min: value,
        price_max: null,
        change_amount: null,
        change_direction: null,
        validation_status: status,
        validation_note: note,
        raw: {
          date_element_id: FUTURES_DATE_ID,
          date_raw: futuresDateRaw,
          month_element_id: month.labelId,
          month_raw: contractMonth,
          value_element_id: month.valueId,
          value_raw: rawValue,
        },
      });

      summary.rows_written += 1;
      if (status === "held") summary.rows_held += 1;
    }
  }
}

// ---------------------------------------------------------------------------
// Source 3: government mandi prices, optional
// ---------------------------------------------------------------------------

const AGMARKNET_RESOURCE =
  "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";

// Prices in this dataset are quoted per quintal.
const KG_PER_QUINTAL = 100;

const AGMARKNET_COMMODITIES: Array<{
  commodity: string;
  cropKey: string;
  displayName: string;
}> = [
  { commodity: "Black pepper", cropKey: "pepper", displayName: "Pepper" },
  { commodity: "Cardamom", cropKey: "cardamom", displayName: "Cardamom" },
];

interface AgmarknetSummary {
  rows_written: number;
  // skipped means the whole source was skipped because no API key is set.
  // rows_skipped counts individual rows that could not be written.
  skipped: boolean;
  rows_skipped: number;
  error: string | null;
}

async function runAgmarknet(
  client: SupabaseClient,
  perKgByCrop: Map<string, number>,
  summary: AgmarknetSummary,
  warnings: string[]
): Promise<void> {
  for (const target of AGMARKNET_COMMODITIES) {
    const url =
      `${AGMARKNET_RESOURCE}?api-key=${encodeURIComponent(DATA_GOV_IN_API_KEY)}` +
      `&format=json&limit=100` +
      `&filters[commodity.keyword]=${encodeURIComponent(target.commodity)}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `agmarknet responded ${response.status} ${response.statusText} for ${target.commodity}`
      );
    }

    const payload: unknown = await response.json();
    const envelope = asRecord(payload);
    if (envelope === null || !Array.isArray(envelope.records)) {
      const shape =
        envelope === null ? typeof payload : Object.keys(envelope).join(", ");
      throw new Error(
        `agmarknet returned an unexpected shape for ${target.commodity}, expected an object with a records array, got keys: ${shape}`
      );
    }

    const records = envelope.records;
    if (records.length === 0) {
      // Normal on Sundays and public holidays.
      console.log(`agmarknet returned no records for ${target.commodity}`);
      continue;
    }

    const modalPrices: number[] = [];
    const arrivalDates: string[] = [];
    for (const entry of records) {
      const record = asRecord(entry);
      if (record === null) continue;
      const modal = toNumber(record.modal_price);
      if (modal !== null) modalPrices.push(modal);
      const arrival = dmyToIsoDate(record.arrival_date);
      if (arrival !== null) arrivalDates.push(arrival);
    }

    const medianModal = median(modalPrices);
    if (medianModal === null) {
      const message = `agmarknet: skipped ${target.cropKey}, ${records.length} records but no usable modal_price`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const perKg = medianModal / KG_PER_QUINTAL;
    // Several markets report on the same pull, so the row is dated by the most
    // recent arrival_date present in the response.
    if (arrivalDates.length === 0) {
      const rawDates = records
        .map((entry) => asRecord(entry)?.arrival_date)
        .slice(0, 5);
      const message = `agmarknet: skipped ${target.cropKey}, no parsable arrival_date, first raw values ${JSON.stringify(rawDates)}`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }
    const sourceDate = arrivalDates.reduce((latest, current) =>
      current > latest ? current : latest
    );

    // The same hard band CPA rows are held against, looked up by crop_key so
    // there is one definition of each band rather than two that can drift.
    const band = Object.values(CPA_CROPS).find(
      (crop) => crop.cropKey === target.cropKey
    );

    let status: ValidationStatus = "ok";
    let note: string | null = null;
    if (band === undefined) {
      status = "held";
      note =
        `no band defined for crop_key ${target.cropKey}, ` +
        `${round2(perKg)} INR per kg is unverified`;
    } else if (perKg < band.bandMinPerKg || perKg > band.bandMaxPerKg) {
      status = "held";
      note =
        `median modal price computes to ${round2(perKg)} INR per kg, ` +
        `outside the expected band ${band.bandMinPerKg} to ${band.bandMaxPerKg} INR per kg`;
    }

    await writeSnapshot(client, {
      source: "agmarknet",
      crop_key: target.cropKey,
      display_name: target.displayName,
      unit: "INR/kg",
      contract_month: "",
      source_date: sourceDate,
      price_min: perKg,
      price_max: null,
      change_amount: null,
      change_direction: null,
      validation_status: status,
      validation_note: note,
      raw: records,
    });

    // Only a value that passed its own band may become the reference the CPA
    // cross-check judges against. An unchecked number must not judge a checked
    // one, so a held row is written for audit but kept out of the map.
    if (status === "ok") perKgByCrop.set(target.cropKey, perKg);
    summary.rows_written += 1;
  }
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (REFRESH_SECRET === "") {
    return json(500, { error: "MARKET_REFRESH_SECRET not configured" });
  }
  if (req.headers.get("x-refresh-secret") !== REFRESH_SECRET) {
    return json(401, { error: "unauthorized" });
  }

  const cpa: CpaSummary = {
    rows_written: 0,
    rows_held: 0,
    rows_flagged: 0,
    rows_skipped: 0,
    error: null,
  };
  const coffeeBoard: CoffeeBoardSummary = {
    rows_written: 0,
    rows_held: 0,
    rows_skipped: 0,
    error: null,
  };
  const agmarknet: AgmarknetSummary = {
    rows_written: 0,
    skipped: false,
    rows_skipped: 0,
    error: null,
  };

  // One short line per row that could not be written. Without this a run in
  // which every date failed to parse would return ok with zero rows and read
  // as a success.
  const warnings: string[] = [];

  // Source 3 runs first because the CPA cross-check reads its per-kg values.
  // A failure here leaves the map empty, which only means the CPA cross-check
  // is skipped, so the other two sources are unaffected.
  const agmarknetPerKg = new Map<string, number>();
  if (DATA_GOV_IN_API_KEY === "") {
    agmarknet.skipped = true;
    console.log("DATA_GOV_IN_API_KEY not set, skipping agmarknet");
  } else {
    try {
      await runAgmarknet(admin, agmarknetPerKg, agmarknet, warnings);
    } catch (err) {
      agmarknet.error = errorMessage(err);
      console.error("agmarknet source failed:", agmarknet.error);
    }
  }

  try {
    await runCpa(admin, agmarknetPerKg, cpa, warnings);
  } catch (err) {
    cpa.error = errorMessage(err);
    console.error("cpa source failed:", cpa.error);
  }

  try {
    await runCoffeeBoard(admin, coffeeBoard, warnings);
  } catch (err) {
    coffeeBoard.error = errorMessage(err);
    console.error("coffee board source failed:", coffeeBoard.error);
  }

  // rows_written counts every row written, whatever its validation status.
  // rows_held and rows_flagged are subsets of it, not separate totals.
  // rows_skipped is disjoint from rows_written: those rows reached no table.
  return json(200, {
    ok: true,
    sources: {
      cpa,
      coffee_board: coffeeBoard,
      agmarknet,
    },
    warnings,
  });
});

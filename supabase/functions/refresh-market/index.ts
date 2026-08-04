// Supabase Edge Function: refresh-market
//
// Pulls outside market reference prices and writes them into
// public.market_snapshots. This is reference data from third parties. It has
// nothing to do with public.price_history, which is internal merchant listing
// data and is never read or written here.
//
// Four sources, each isolated in its own try/catch so one bad source cannot
// stop the others:
//   1. Coorg Planters' Association JSON API      source 'cpa'
//   2. Coffee Board of India home page HTML      source 'coffee_board'
//   3. data.gov.in mandi prices (optional)       source 'agmarknet'
//   4. Spices Board daily auction HTML           source 'spices_board'
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

// The Spices Board auction page uses DD-Mon-YYYY, for example 03-Aug-2026.
//
// Deliberately not folded into dmyToIsoDate above. That one reads DD/MM/YYYY,
// where the middle field is a number, and the two formats agree on nothing but
// the day coming first. Teaching one function both would mean a regex loose
// enough to accept either, and a loose date regex on a page whose structure can
// change is how a wrong date gets stored looking perfectly ordinary.
//
// Matching is on the first three letters of the month name, so Sep, Sept and
// September all resolve alike rather than only the spelling in use today. An
// unknown month name returns null and the caller skips the block; it never
// falls back to a month index of 0, which would silently date the row January.
const MONTH_NAME_INDEX: Record<string, number> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12,
};

function dMonYToIsoDate(value: unknown): string | null {
  const text = toText(value);
  if (text === null) return null;
  const match = text.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/);
  if (!match) return null;

  const month = MONTH_NAME_INDEX[match[2].slice(0, 3).toLowerCase()];
  if (month === undefined) return null;

  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;

  return `${match[3]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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

// Cardamom used to sit in this list and was removed deliberately.
//
// The query filters on commodity.keyword alone with no variety filter, so
// "Cardamom" returns Small and Large Cardamom together. Those are two different
// crops selling at very different prices, and a median across them is a number
// describing neither. That median was then handed to runCpa as the reference
// the CPA cross-check judges against, where it could mark a perfectly correct
// CPA cardamom row as flagged.
//
// Cardamom is served by the Spices Board auction now, which publishes Small
// Cardamom specifically and daily. The cross-check logic itself is untouched:
// with cardamom out of this list the map simply never gains a cardamom entry,
// so the check does not fire for that crop.
const AGMARKNET_COMMODITIES: Array<{
  commodity: string;
  cropKey: string;
  displayName: string;
}> = [
  { commodity: "Black pepper", cropKey: "pepper", displayName: "Pepper" },
];

// How wide a net the pepper query cast to find a price. Recorded on the row and
// returned in the HTTP summary, because level 1 and the two below it are
// different claims: one is a Kodagu price and the others explicitly are not.
type GeographyLevel = "kodagu" | "karnataka" | "india";

// The ladder, tried in order, stopping at the first level that returns records.
//
// "Kodagu" is the only district spelling this dataset answers to. Coorg,
// Madikeri and Kodagu(Coorg) were all checked against the live resource on
// 4 August 2026 and every one of them returned zero records, so none of them
// belongs here as an alternate spelling to try.
const PEPPER_GEOGRAPHY_LADDER: Array<{
  level: GeographyLevel;
  filters: Record<string, string>;
}> = [
  { level: "kodagu", filters: { "filters[district.keyword]": "Kodagu" } },
  { level: "karnataka", filters: { "filters[state.keyword]": "Karnataka" } },
  { level: "india", filters: {} },
];

// The exact commodity string the dataset publishes. The parentheses are part of
// the value: a plain "Arecanut" returns zero records.
const ARECANUT_COMMODITY = "Arecanut(Betelnut/Supari)";

// Arecanut is pulled state-wide and then narrowed to this one district in code,
// because the dataset has no filter for a taluk.
//
// Sulya taluk in Dakshina Kannada shares a border with Kodagu. The only other
// Karnataka district publishing arecanut is Shivamogga, whose market is
// Thirthahalli, two districts away with Chikkamagaluru and Hassan in between.
// A Thirthahalli price is not a near-Kodagu price and is discarded rather than
// shown, so this never silently widens when Dakshina Kannada is quiet.
const ARECANUT_DISTRICT = "Dakshina Kannada";

const ARECANUT_CROP_KEY_PREFIX = "arecanut_";

// Arecanut has no CPA entry, and it must not gain a fake one: CPA_CROPS is the
// record of what the Coorg Planters' Association publishes, and inventing a row
// there would put a crop in that body's mouth. So the band lives here, beside
// the lookup that would otherwise return undefined and hold every arecanut row.
//
// Wide on purpose. It is a sanity bound catching a decimal slip or a per-quintal
// figure that escaped the divide, not a forecast. The four varieties seen on
// 4 August 2026 ran from 136 to 430 INR per kg.
const ARECANUT_BAND_MIN_PER_KG = 100;
const ARECANUT_BAND_MAX_PER_KG = 3000;

// The response carries up to this many records. Raised from 100, which was low
// enough that an all-India pepper query was silently reading a fraction of the
// day and calling its median the national price.
const AGMARKNET_LIMIT = 1000;

// A bounded slice of the response kept in raw for audit.
//
// raw used to hold the entire records array. At limit 100 that was already the
// heaviest column in the table, and at 1000 it would be ten times that, stored
// once per crop per day forever. The summary fields around it carry what the
// card actually reads, so the sample exists only to make a stored row traceable
// back to the response it came from.
const AGMARKNET_RAW_SAMPLE = 20;

interface AgmarknetSummary {
  rows_written: number;
  // skipped means the whole source was skipped because no API key is set.
  // rows_skipped counts individual rows that could not be written.
  skipped: boolean;
  rows_skipped: number;
  // Which rung of the ladder pepper resolved to, and the markets behind it.
  // Null when pepper produced no row at all.
  pepper_geography_level: GeographyLevel | null;
  pepper_markets: string[];
  // Arecanut is counted apart from pepper because it is a different crop from a
  // different district, and a caller reading rows_written alone could not tell
  // which of the two produced them.
  arecanut_rows_written: number;
  arecanut_varieties: string[];
  arecanut_error: string | null;
  error: string | null;
}

// One request against the resource, returning the records and the total the
// envelope reported.
//
// records.length and total are both returned rather than one being trusted,
// because they answer different questions: total is how many rows the dataset
// holds for this filter, records.length is how many arrived. A gap means the
// limit truncated the response and every median below it is computed on a
// slice, which is exactly the failure that made an all-India pepper median look
// authoritative at limit 100. It warns rather than throws: a truncated answer is
// still an answer, and a named warning lets a reader of the summary judge it.
async function fetchAgmarknet(
  label: string,
  filters: Record<string, string>,
  warnings: string[]
): Promise<{ records: unknown[]; total: number | null }> {
  const params = new URLSearchParams();
  params.set("api-key", DATA_GOV_IN_API_KEY);
  params.set("format", "json");
  params.set("limit", String(AGMARKNET_LIMIT));
  for (const [key, value] of Object.entries(filters)) params.set(key, value);

  const response = await fetch(`${AGMARKNET_RESOURCE}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(
      `agmarknet responded ${response.status} ${response.statusText} for ${label}`
    );
  }

  const payload: unknown = await response.json();
  const envelope = asRecord(payload);
  if (envelope === null || !Array.isArray(envelope.records)) {
    const shape =
      envelope === null ? typeof payload : Object.keys(envelope).join(", ");
    throw new Error(
      `agmarknet returned an unexpected shape for ${label}, expected an object with a records array, got keys: ${shape}`
    );
  }

  const records = envelope.records;
  const total = toNumber(envelope.total);

  if (total !== null && total !== records.length) {
    const message =
      `agmarknet: ${label} returned ${records.length} records but the response ` +
      `total field says ${total}, at limit ${AGMARKNET_LIMIT}`;
    console.warn(message);
    warnings.push(message);
  }

  return { records, total };
}

// The distinct non-empty values of one field, in first-seen order.
function distinctField(records: unknown[], field: string): string[] {
  const seen: string[] = [];
  for (const entry of records) {
    const value = toText(asRecord(entry)?.[field]);
    if (value !== null && !seen.includes(value)) seen.push(value);
  }
  return seen;
}

// The newest parsable arrival_date across a set of records, or null when none
// of them carries one. Several markets report on the same pull, so a row is
// dated by the most recent date present rather than the first.
function latestArrivalDate(records: unknown[]): string | null {
  let latest: string | null = null;
  for (const entry of records) {
    const arrival = dmyToIsoDate(asRecord(entry)?.arrival_date);
    if (arrival === null) continue;
    if (latest === null || arrival > latest) latest = arrival;
  }
  return latest;
}

function modalPricesOf(records: unknown[]): number[] {
  const prices: number[] = [];
  for (const entry of records) {
    const modal = toNumber(asRecord(entry)?.modal_price);
    if (modal !== null) prices.push(modal);
  }
  return prices;
}

async function runAgmarknet(
  client: SupabaseClient,
  perKgByCrop: Map<string, number>,
  summary: AgmarknetSummary,
  warnings: string[]
): Promise<void> {
  for (const target of AGMARKNET_COMMODITIES) {
    // THE FALLBACK LADDER. Kodagu first, then Karnataka, then no geography
    // filter at all, stopping at the first level that returns anything.
    //
    // The level travels with the row because the three are not interchangeable.
    // A Kodagu price is the price at the reader's own two markets. A Karnataka
    // or all-India median is a different fact wearing the same clothes, and the
    // card has to be able to say which one it is holding.
    let level: GeographyLevel | null = null;
    let records: unknown[] = [];
    let total: number | null = null;

    for (const rung of PEPPER_GEOGRAPHY_LADDER) {
      const label = `${target.commodity} at ${rung.level}`;
      const result = await fetchAgmarknet(
        label,
        {
          "filters[commodity.keyword]": target.commodity,
          ...rung.filters,
        },
        warnings
      );
      if (result.records.length > 0) {
        level = rung.level;
        records = result.records;
        total = result.total;
        break;
      }
      console.log(`agmarknet returned no records for ${label}`);
    }

    if (level === null) {
      // Normal on Sundays and public holidays, and now only reached when even
      // the unfiltered query is empty.
      console.log(
        `agmarknet returned no records for ${target.commodity} at any geography level`
      );
      continue;
    }

    const medianModal = median(modalPricesOf(records));
    if (medianModal === null) {
      const message = `agmarknet: skipped ${target.cropKey}, ${records.length} records at ${level} but no usable modal_price`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const perKg = medianModal / KG_PER_QUINTAL;
    const sourceDate = latestArrivalDate(records);
    if (sourceDate === null) {
      const rawDates = records
        .map((entry) => asRecord(entry)?.arrival_date)
        .slice(0, 5);
      const message = `agmarknet: skipped ${target.cropKey}, no parsable arrival_date, first raw values ${JSON.stringify(rawDates)}`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const markets = distinctField(records, "market");

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
      // A summary plus a bounded sample, not the whole response. The card reads
      // geography_level and markets from here, so those two are stored as
      // fields rather than left to be re-derived by scanning the sample, which
      // would be wrong the moment the sample truncated.
      raw: {
        geography_level: level,
        markets,
        districts: distinctField(records, "district"),
        record_count: records.length,
        total,
        limit: AGMARKNET_LIMIT,
        sample: records.slice(0, AGMARKNET_RAW_SAMPLE),
      },
    });

    summary.pepper_geography_level = level;
    summary.pepper_markets = markets;

    // Only a value that passed its own band may become the reference the CPA
    // cross-check judges against. An unchecked number must not judge a checked
    // one, so a held row is written for audit but kept out of the map.
    if (status === "ok") perKgByCrop.set(target.cropKey, perKg);
    summary.rows_written += 1;
  }

  // Arecanut runs inside its own try/catch rather than sharing the source's.
  //
  // Pepper feeds perKgByCrop, which the CPA cross-check reads, and pepper has
  // already been written by this point. Letting an arecanut failure throw out
  // of here would discard that reference and weaken a check on a different
  // crop, for a fault that has nothing to do with it.
  try {
    await runArecanut(client, summary, warnings);
  } catch (err) {
    summary.arecanut_error = errorMessage(err);
    console.error("agmarknet arecanut failed:", summary.arecanut_error);
  }
}

// crop_key for a variety: the prefix plus the variety lowercased with every
// run of non-alphanumeric characters collapsed to a single underscore.
//
//   "New Variety" -> arecanut_new_variety
//   "Cqca"        -> arecanut_cqca
//
// Trailing underscores are trimmed so a variety ending in punctuation does not
// produce a key ending in one. A variety that reduces to nothing at all returns
// null and the caller skips it, because a bare "arecanut_" key would collide
// with the next such variety and the two would overwrite each other.
function arecanutCropKey(variety: string): string | null {
  const slug = variety
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug === "" ? null : `${ARECANUT_CROP_KEY_PREFIX}${slug}`;
}

// Arecanut from the one district that borders Kodagu, one row per variety.
//
// ONE ROW PER VARIETY, never a single arecanut median. On 4 August 2026 the two
// Sulya varieties were 43,000 and 28,000 per quintal, 15,000 apart. A median
// across them is 35,500, a price no one paid for anything, and it would sit on
// the card looking exactly as solid as a real one.
//
// A variety with a single record is kept. Sulya published n=1 per variety, so
// any minimum-count rule would delete the entire crop rather than improve it.
async function runArecanut(
  client: SupabaseClient,
  summary: AgmarknetSummary,
  warnings: string[]
): Promise<void> {
  const { records, total } = await fetchAgmarknet(
    `${ARECANUT_COMMODITY} in Karnataka`,
    {
      "filters[commodity.keyword]": ARECANUT_COMMODITY,
      "filters[state.keyword]": "Karnataka",
    },
    warnings
  );

  // Narrowed in code, because the dataset has no taluk filter. Everything
  // outside the bordering district is discarded here and never reaches a row.
  const local = records.filter(
    (entry) => toText(asRecord(entry)?.district) === ARECANUT_DISTRICT
  );

  if (local.length === 0) {
    // Nothing is written and no card renders. This does NOT widen to another
    // district: the whole reason arecanut is shown at all is that Sulya is next
    // door, and a Shivamogga price standing in for it would quietly answer a
    // question the reader did not ask.
    console.log(
      `agmarknet: no arecanut rows for ${ARECANUT_DISTRICT}, ` +
        `${records.length} Karnataka records seen, writing nothing`
    );
    return;
  }

  // Group by the variety string exactly as returned, so the display name is the
  // publisher's own word and not a tidied version of it.
  const byVariety = new Map<string, unknown[]>();
  for (const entry of local) {
    const variety = toText(asRecord(entry)?.variety);
    if (variety === null) {
      const message = "agmarknet: skipped an arecanut record with no variety";
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }
    const group = byVariety.get(variety) ?? [];
    group.push(entry);
    byVariety.set(variety, group);
  }

  for (const [variety, group] of byVariety) {
    const cropKey = arecanutCropKey(variety);
    if (cropKey === null) {
      const message = `agmarknet: skipped arecanut variety ${JSON.stringify(variety)}, no usable crop_key`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    // Median within the variety, which is the variety's own price when there is
    // one record, as there was on every variety seen so far. It is a median
    // across markets reporting the same variety, never across varieties.
    const medianModal = median(modalPricesOf(group));
    if (medianModal === null) {
      const message = `agmarknet: skipped ${cropKey}, ${group.length} records but no usable modal_price`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const sourceDate = latestArrivalDate(group);
    if (sourceDate === null) {
      const message = `agmarknet: skipped ${cropKey}, no parsable arrival_date`;
      console.error(message);
      warnings.push(message);
      summary.rows_skipped += 1;
      continue;
    }

    const perKg = medianModal / KG_PER_QUINTAL;
    const markets = distinctField(group, "market");

    // The band defined at the top of this section, not a CPA_CROPS lookup. That
    // lookup searches by cropKey and would return undefined for every arecanut
    // key, holding every row it wrote.
    let status: ValidationStatus = "ok";
    let note: string | null = null;
    if (perKg < ARECANUT_BAND_MIN_PER_KG || perKg > ARECANUT_BAND_MAX_PER_KG) {
      status = "held";
      note =
        `modal price computes to ${round2(perKg)} INR per kg, ` +
        `outside the expected band ${ARECANUT_BAND_MIN_PER_KG} to ${ARECANUT_BAND_MAX_PER_KG} INR per kg`;
    }

    await writeSnapshot(client, {
      source: "agmarknet",
      crop_key: cropKey,
      display_name: variety,
      unit: "INR/kg",
      contract_month: "",
      source_date: sourceDate,
      price_min: perKg,
      price_max: null,
      change_amount: null,
      change_direction: null,
      validation_status: status,
      validation_note: note,
      raw: {
        commodity: ARECANUT_COMMODITY,
        district: ARECANUT_DISTRICT,
        variety,
        markets,
        record_count: group.length,
        karnataka_record_count: records.length,
        total,
        limit: AGMARKNET_LIMIT,
        sample: group.slice(0, AGMARKNET_RAW_SAMPLE),
      },
    });

    // DELIBERATELY NOT ADDED TO perKgByCrop. That map is the reference the CPA
    // cross-check judges CPA rows against, and CPA publishes no arecanut. An
    // entry here would be a price with nothing to compare it to at best, and at
    // worst a key collision with a crop that does have a CPA row.
    summary.rows_written += 1;
    summary.arecanut_rows_written += 1;
    summary.arecanut_varieties.push(variety);
  }
}

// ---------------------------------------------------------------------------
// Source 4: Spices Board of India, daily cardamom auction
// ---------------------------------------------------------------------------

// Free, no API key, no registration, server-rendered HTML. No scraper service.
const SPICES_BOARD_URL =
  "https://www.indianspices.com/marketing/price/domestic/daily-price.html";

const SPICES_BOARD_SOURCE = "spices_board";
const CARDAMOM_AUCTION_CROP_KEY = "cardamom_auction";

// The band the day's average price has to fall inside to be published, reused
// from the CPA cardamom entry rather than written again here.
//
// Small Cardamom on this page and CPA's "Cardamom" are the same physical
// commodity quoted in the same unit, so they get the same band by definition.
// Two literals would be two things to keep in step by hand, which is the exact
// drift the agmarknet source already avoids by looking its band up rather than
// restating it.
const CARDAMOM_BAND = CPA_CROPS.cardamom;

// The page carries its prices as text inside a scrolling marquee, with tags in
// the middle of the fields: "Spice: Small Cardamom" sits in a <b> while the
// numbers after it do not. So the tags come out first and the whitespace is
// collapsed, and the block is matched on the flattened text.
function flattenHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ");
}

// One Small Cardamom auction block.
//
// Large Cardamom is excluded by construction, not by a filter that could be
// removed later: it is a different crop from the Sikkim and West Bengal markets
// and its blocks have a different shape, reading "Date:" with a Market and a
// Type and carrying no auctioneer at all. A pattern that demands "Small
// Cardamom" followed by "Date of Auction:" and "Auctioneer:" cannot match one.
// Kodagu grows Small Cardamom.
const SMALL_CARDAMOM_BLOCK =
  /Spice:\s*Small Cardamom\s*,\s*Date of Auction:\s*([0-9]{1,2}-[A-Za-z]+-[0-9]{4})\s*,\s*Auctioneer:\s*(.*?)\s*,\s*No\.of lots:\s*([0-9.,]+)\s*,\s*Qty Arrived \(Kgs\):\s*([0-9.,]+)\s*,\s*Qty Sold \(Kgs\):\s*([0-9.,]+)\s*,\s*Max Price \(Rs\.\/Kg\):\s*([0-9.,]+)\s*,\s*Avg\. Price \(Rs\.\/Kg\):\s*([0-9.,]+)/gi;

interface AuctionBlock {
  auction_date: string | null;
  auction_date_raw: string;
  auctioneer: string;
  lots: number | null;
  qty_arrived_kg: number | null;
  qty_sold_kg: number | null;
  max_price_per_kg: number | null;
  avg_price_per_kg: number | null;
}

function parseSmallCardamomBlocks(html: string): AuctionBlock[] {
  const text = flattenHtml(html);
  const blocks: AuctionBlock[] = [];

  for (const match of text.matchAll(SMALL_CARDAMOM_BLOCK)) {
    blocks.push({
      auction_date: dMonYToIsoDate(match[1]),
      auction_date_raw: match[1],
      auctioneer: match[2],
      lots: toNumber(match[3]),
      qty_arrived_kg: toNumber(match[4]),
      qty_sold_kg: toNumber(match[5]),
      max_price_per_kg: toNumber(match[6]),
      avg_price_per_kg: toNumber(match[7]),
    });
  }

  return blocks;
}

// The day's average price per kg across every auctioneer, weighted by the
// quantity each of them actually sold.
//
// Weighted, not a plain mean of the two published averages. Total value over
// total quantity is what "the average price cardamom sold at today" means, and
// the two auctions are not the same size: on the day this was written one moved
// 53,589 kg and the other 17,969 kg, so a plain mean would let the smaller
// auction pull the day's figure as hard as the one three times its size. That
// is a difference of about 43 rupees a kilo on the number a farmer reads.
//
// Falls back to the plain mean only when no quantity is usable, since a
// weighting by zero would be a divide by zero rather than an answer. Which of
// the two was used is recorded on the row, so the stored number can always be
// traced back to the arithmetic that produced it.
interface DayAggregate {
  average_price_per_kg: number | null;
  highest_max_price_per_kg: number | null;
  qty_sold_kg: number | null;
  qty_arrived_kg: number | null;
  lots: number | null;
  auctioneer_count: number;
  average_method: "weighted_by_qty_sold" | "unweighted_mean" | "none";
}

function sumOrNull(values: Array<number | null>): number | null {
  const present = values.filter((value): value is number => value !== null);
  return present.length === 0
    ? null
    : present.reduce((total, value) => total + value, 0);
}

function aggregateDay(blocks: AuctionBlock[]): DayAggregate {
  const averages = blocks.filter(
    (block): block is AuctionBlock & { avg_price_per_kg: number } =>
      block.avg_price_per_kg !== null
  );

  const weighable = averages.filter(
    (block) => block.qty_sold_kg !== null && block.qty_sold_kg > 0
  );
  const weighableQty = weighable.reduce(
    (total, block) => total + (block.qty_sold_kg as number),
    0
  );

  let average: number | null = null;
  let method: DayAggregate["average_method"] = "none";

  if (weighable.length > 0 && weighableQty > 0) {
    const value = weighable.reduce(
      (total, block) =>
        total + block.avg_price_per_kg * (block.qty_sold_kg as number),
      0
    );
    average = value / weighableQty;
    method = "weighted_by_qty_sold";
  } else if (averages.length > 0) {
    average =
      averages.reduce((total, block) => total + block.avg_price_per_kg, 0) /
      averages.length;
    method = "unweighted_mean";
  }

  const maxima = blocks
    .map((block) => block.max_price_per_kg)
    .filter((value): value is number => value !== null);

  return {
    average_price_per_kg: average === null ? null : round2Number(average),
    highest_max_price_per_kg: maxima.length === 0 ? null : Math.max(...maxima),
    qty_sold_kg: sumOrNull(blocks.map((block) => block.qty_sold_kg)),
    qty_arrived_kg: sumOrNull(blocks.map((block) => block.qty_arrived_kg)),
    lots: sumOrNull(blocks.map((block) => block.lots)),
    auctioneer_count: blocks.length,
    average_method: method,
  };
}

function round2Number(value: number): number {
  return Math.round(value * 100) / 100;
}

interface SpicesBoardSummary {
  rows_written: number;
  rows_held: number;
  rows_skipped: number;
  auction_date: string | null;
  error: string | null;
}

async function runSpicesBoard(
  client: SupabaseClient,
  summary: SpicesBoardSummary,
  warnings: string[]
): Promise<void> {
  const response = await fetch(SPICES_BOARD_URL, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!response.ok) {
    throw new Error(
      `spices board responded ${response.status} ${response.statusText}`
    );
  }

  const html = await response.text();
  const blocks = parseSmallCardamomBlocks(html);
  if (blocks.length === 0) {
    // Not treated as a quiet no-op. The page always carries the most recent
    // session, so nothing matching means the block shape moved, and a run that
    // returned ok with zero rows would read as a working day with no auction.
    throw new Error(
      "spices board: no Small Cardamom block matched, page structure may have changed"
    );
  }

  // The page can carry more than one session. Only the newest auction date is
  // written, so an older session still sitting in the marquee cannot overwrite
  // a newer one or be published as today's rate.
  const dated = blocks.filter(
    (block): block is AuctionBlock & { auction_date: string } =>
      block.auction_date !== null
  );
  for (const block of blocks) {
    if (block.auction_date !== null) continue;
    const message = `spices_board: skipped ${block.auctioneer}, unparsable auction date ${JSON.stringify(block.auction_date_raw)}`;
    console.error(message);
    warnings.push(message);
    summary.rows_skipped += 1;
  }
  if (dated.length === 0) return;

  const auctionDate = dated.reduce(
    (latest, block) =>
      block.auction_date > latest ? block.auction_date : latest,
    dated[0].auction_date
  );
  const dayBlocks = dated.filter((block) => block.auction_date === auctionDate);
  const day = aggregateDay(dayBlocks);
  summary.auction_date = auctionDate;

  // The sanity band, checked once for the day because the day's average is what
  // every row carries and therefore what a reader would see.
  let status: ValidationStatus = "ok";
  let note: string | null = null;
  if (day.average_price_per_kg === null) {
    status = "held";
    note =
      `no usable average price in ${dayBlocks.length} Small Cardamom block(s) ` +
      `for ${auctionDate}, page structure may have changed`;
  } else if (
    day.average_price_per_kg < CARDAMOM_BAND.bandMinPerKg ||
    day.average_price_per_kg > CARDAMOM_BAND.bandMaxPerKg
  ) {
    status = "held";
    note =
      `average price ${round2(day.average_price_per_kg)} INR per kg, ` +
      `outside the expected band ${CARDAMOM_BAND.bandMinPerKg} to ${CARDAMOM_BAND.bandMaxPerKg} INR per kg`;
  }

  // One row per auctioneer. The auctioneer is the contract_month, because the
  // unique index is (source, crop_key, contract_month, source_date) and two
  // auctioneers share a date, so without it the second would overwrite the
  // first and the day would be reported as half of itself.
  //
  // price_min and price_max carry the day's figures rather than this
  // auctioneer's, so a reader of any single row gets the day. This auctioneer's
  // own published numbers are not lost: they are the block in raw, next to the
  // aggregate they went into.
  for (const block of dayBlocks) {
    await writeSnapshot(client, {
      source: SPICES_BOARD_SOURCE,
      crop_key: CARDAMOM_AUCTION_CROP_KEY,
      display_name: "Small Cardamom",
      unit: "INR/kg",
      contract_month: block.auctioneer,
      source_date: auctionDate,
      price_min: day.average_price_per_kg,
      price_max: day.highest_max_price_per_kg,
      change_amount: null,
      change_direction: null,
      validation_status: status,
      validation_note: note,
      raw: { block, day },
    });

    summary.rows_written += 1;
    if (status === "held") summary.rows_held += 1;
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
    pepper_geography_level: null,
    pepper_markets: [],
    arecanut_rows_written: 0,
    arecanut_varieties: [],
    arecanut_error: null,
    error: null,
  };
  const spicesBoard: SpicesBoardSummary = {
    rows_written: 0,
    rows_held: 0,
    rows_skipped: 0,
    auction_date: null,
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

  try {
    await runSpicesBoard(admin, spicesBoard, warnings);
  } catch (err) {
    spicesBoard.error = errorMessage(err);
    console.error("spices board source failed:", spicesBoard.error);
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
      spices_board: spicesBoard,
    },
    warnings,
  });
});

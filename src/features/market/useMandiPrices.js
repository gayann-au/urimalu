import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

// The government market yard rows, fetched apart from the main snapshots query.
//
// WHY A SECOND QUERY. The same reason useCardamomAuction has one: these rows
// need raw and the main query does not fetch it. The pepper card has to say
// which geography the rate came from and which market yards reported it, and
// both facts live in raw. useMarketSnapshots leaves raw out for every screen,
// and widening it would pull this payload onto every page that reads a price.
//
// The rows arrive through the main query too, without raw. Harmless there: that
// board builds its cards from the six app crop keys and reads only cpa rows
// into them, so nothing renders twice.

const SOURCE_AGMARKNET = "agmarknet";
// One row per market now, so pepper rows are matched by prefix exactly as the
// arecanut variety rows are. The bare "pepper" key belonged to the old single
// combined row and is deliberately NOT matched: that figure was a median across
// markets, a number no government page shows, and any such row still sitting in
// the table must never reach a card again.
const PEPPER_PREFIX = "pepper_";
const ARECANUT_PREFIX = "arecanut_";

const STATUS_HELD = "held";

// Matches the other two market queries. The refresh job runs once each morning,
// so a shorter window would be waste rather than freshness.
const MANDI_STALE_TIME_MS = 15 * 60_000;

// One pepper row plus one row per arecanut variety. Four varieties were seen
// across the whole state on the day this was written and only two of them were
// in the district we keep, so twelve leaves room for the list to grow without
// this becoming an unbounded fetch of a table that only ever gains rows.
const MANDI_ROW_LIMIT = 12;

const MANDI_COLUMNS =
  "source, crop_key, display_name, price_min, price_max, unit, " +
  "contract_month, source_date, validation_status, validation_note, " +
  "fetched_at, raw";

async function fetchMandiPrices() {
  const { data, error } = await supabase
    .from("market_snapshots")
    .select(MANDI_COLUMNS)
    .eq("source", SOURCE_AGMARKNET)
    // The same non-negotiable read rule the other two queries enforce. Held
    // means the refresh function could not stand behind the number, so it never
    // reaches a screen, and a third query is a third place that has to say so.
    .neq("validation_status", STATUS_HELD)
    .order("source_date", { ascending: false })
    .order("fetched_at", { ascending: false })
    .limit(MANDI_ROW_LIMIT);
  if (error) throw error;
  return data || [];
}

export function useMandiPrices() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: qk.mandiPrices,
    enabled: isAuthenticated,
    queryFn: fetchMandiPrices,
    staleTime: MANDI_STALE_TIME_MS,
  });
}

// ---------------------------------------------------------------------------
// Pure selectors. No React, no network, testable on plain arrays.
// ---------------------------------------------------------------------------

// Every row from the newest day present whose crop_key carries a prefix, one
// row per crop_key.
//
// Restricted to a single source_date on purpose. Markets and varieties do not
// all trade every day, so a card set built from whatever is newest per key could
// put Tuesday's market beside Friday's under a single date line, and a reader
// would have no way to tell. Taking the newest day and only that day means one
// date line is true of every row shown.
//
// source_date is a date column, compared as a string on purpose: YYYY-MM-DD
// sorts lexicographically in exact calendar order, and parsing it into a
// timestamp would drag a timezone into a comparison that has no time in it. The
// same reasoning as compareSourceDateDesc in useMarketSnapshots.
//
// Ordered by display_name, never by price. Sorting by what a market or variety
// is worth would rank them for the reader, which is a verdict, and this feature
// does not give verdicts.
function newestDayRowsByPrefix(rows, prefix) {
  const candidates = [];
  for (const row of rows || []) {
    if (!row || !row.source_date) continue;
    if (typeof row.crop_key !== "string") continue;
    if (!row.crop_key.startsWith(prefix)) continue;
    candidates.push(row);
  }
  if (candidates.length === 0) return [];

  const newestDate = candidates.reduce(
    (latest, row) =>
      String(row.source_date) > latest ? String(row.source_date) : latest,
    String(candidates[0].source_date)
  );

  // One row per crop_key, in case a day carries a duplicate. The query already
  // orders by fetched_at descending, so the first seen is the newest fetch.
  const byCropKey = new Map();
  for (const row of candidates) {
    if (String(row.source_date) !== newestDate) continue;
    if (!byCropKey.has(row.crop_key)) byCropKey.set(row.crop_key, row);
  }

  return [...byCropKey.values()].sort((a, b) =>
    String(a.display_name ?? "").localeCompare(String(b.display_name ?? ""))
  );
}

// One pepper row per market yard, from the newest day published.
export function pepperMarketRows(rows) {
  return newestDayRowsByPrefix(rows, PEPPER_PREFIX);
}

// One arecanut row per variety, from the newest day published.
export function arecanutRows(rows) {
  return newestDayRowsByPrefix(rows, ARECANUT_PREFIX);
}

// The market's own usual price, its modal_price as published, in rupees per kg.
//
// Null when the row does not carry one. It is neither end of the range, so it
// has no column of its own and lives in raw. A card that cannot read it drops
// that one line rather than showing a guess or repeating an end of the range.
export function mandiModalPerKg(row) {
  const value = row?.raw?.modal_per_kg;
  if (value == null || value === "" || isNaN(Number(value))) return null;
  return Number(value);
}

// Whether a row carries two genuinely different ends.
//
// A market whose min and max are the same published one price, and printing
// "350 to 350" would invent a spread the source does not show. Callers use this
// both to pick the price text and to decide whether a quantity may be
// multiplied across a range.
export function hasRealRange(row) {
  const min = row?.price_min;
  const max = row?.price_max;
  if (max == null || max === "" || isNaN(Number(max))) return false;
  if (min == null || min === "" || isNaN(Number(min))) return false;
  return Number(max) !== Number(min);
}

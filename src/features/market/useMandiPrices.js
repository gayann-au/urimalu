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
const CROP_KEY_PEPPER = "pepper";
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

// source_date is a date column, compared as a string on purpose: YYYY-MM-DD
// sorts lexicographically in exact calendar order, and parsing it into a
// timestamp would drag a timezone into a comparison that has no time in it. The
// same reasoning as compareSourceDateDesc in useMarketSnapshots.
function isNewer(row, current) {
  if (current === null) return true;
  return String(row.source_date) > String(current.source_date);
}

// The newest market yard pepper row, or null.
export function mandiPepperRow(rows) {
  let newest = null;
  for (const row of rows || []) {
    if (!row || !row.source_date) continue;
    if (row.crop_key !== CROP_KEY_PEPPER) continue;
    if (isNewer(row, newest)) newest = row;
  }
  return newest;
}

// How wide a net the pepper rate came from: "kodagu", "karnataka" or "india".
//
// Null when the row does not say. A row written before this field existed has
// no level, and guessing "kodagu" for it would put the strongest of the three
// claims on screen with nothing behind it. The card renders no geography line
// at all in that case rather than an assumed one.
export function mandiGeographyLevel(row) {
  const level = row?.raw?.geography_level;
  return typeof level === "string" && level !== "" ? level : null;
}

// The market yards behind a row, as an array. Empty when the row does not say.
export function mandiMarkets(row) {
  const markets = row?.raw?.markets;
  if (!Array.isArray(markets)) return [];
  return markets.filter((m) => typeof m === "string" && m !== "");
}

// Every arecanut variety row from the newest day present, one per variety.
//
// Restricted to a single source_date on purpose. Varieties do not all trade
// every day, so a card built from whatever is newest per variety could show one
// variety from Tuesday beside another from Friday under a single date line, and
// a reader would have no way to tell. Taking the newest day and only that day
// means the card's one date is true of every row on it.
//
// Ordered by display_name, never by price. Sorting these by what they are worth
// would rank varieties for the reader, which is a verdict, and this feature
// does not give verdicts.
export function arecanutRows(rows) {
  const candidates = [];
  for (const row of rows || []) {
    if (!row || !row.source_date) continue;
    if (typeof row.crop_key !== "string") continue;
    if (!row.crop_key.startsWith(ARECANUT_PREFIX)) continue;
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

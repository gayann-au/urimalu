import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";
import { contractMonthOrder } from "../../lib/marketCrops";

// One query, 14 rows today, no pagination concern and no realtime.
//
// Explicit column list, never select("*"), matching the house rule visible in
// useFeed.js. raw and app_crop_names are deliberately not fetched: raw is a
// large jsonb audit payload that no screen needs, and app_crop_names is null on
// every row, which is why marketCrops.js still carries the mapping.
const MARKET_SNAPSHOT_COLUMNS =
  "source, crop_key, display_name, price_min, price_max, unit, " +
  "contract_month, source_date, change_amount, change_direction, " +
  "validation_status, validation_note, fetched_at, created_at";

const SOURCE_CPA = "cpa";
const SOURCE_COFFEE_BOARD = "coffee_board";

const STATUS_HELD = "held";
const STATUS_FLAGGED = "flagged";

// The source refreshes once a day at 06:00 IST, so the 30 second global default
// would be pure waste on a weak hill connection.
const MARKET_STALE_TIME_MS = 15 * 60_000;

// Separator for the grouping key below. A NUL byte cannot appear in any of the
// three column values, so two distinct triples can never collide into one key.
// Built with fromCharCode rather than written literally: a raw NUL in source
// makes git treat the file as binary and stop diffing it.
const KEY_SEPARATOR = String.fromCharCode(0);

async function fetchMarketSnapshots() {
  const { data, error } = await supabase
    .from("market_snapshots")
    .select(MARKET_SNAPSHOT_COLUMNS)
    // Pushes the non-negotiable read rule into the database. The selectors
    // below repeat it, because "must never reach a screen" deserves two locks.
    .neq("validation_status", STATUS_HELD)
    .order("source_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

// enabled: isAuthenticated so no request fires for logged-out visitors. The RLS
// policy is `to authenticated` and would return zero rows anyway; this just
// avoids the wasted round trip.
export function useMarketSnapshots() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: qk.marketSnapshots,
    enabled: isAuthenticated,
    queryFn: fetchMarketSnapshots,
    staleTime: MARKET_STALE_TIME_MS,
  });
}

// ---------------------------------------------------------------------------
// Pure selectors. No React, no network, testable on plain arrays.
// ---------------------------------------------------------------------------

// A flagged row is a fact with a caveat, not a failure. It is returned like any
// other row and carries its validation_note for the caller to render verbatim.
// It is never dropped, never hidden, and must not be styled as an error.
//
// Zero flagged rows exist today, so this path has never been rendered and is
// unproven against live data.
export function isFlagged(row) {
  return row?.validation_status === STATUS_FLAGGED;
}

// Held means the refresh function could not stand behind the number, so it must
// never reach a screen. Zero held rows exist today, so this path is likewise
// unproven against live data.
function isHeld(row) {
  return row?.validation_status === STATUS_HELD;
}

// source_date is a date column, compared as a string on purpose: YYYY-MM-DD
// sorts lexicographically in exact calendar order, and parsing it into a
// timestamp would drag a timezone into a comparison that has no time in it.
// Missing or empty sorts oldest.
function compareSourceDateDesc(a, b) {
  const x = a || "";
  const y = b || "";
  if (x === y) return 0;
  return x > y ? -1 : 1;
}

// fetched_at and created_at are timestamptz, where two rows can carry different
// offsets, so these are parsed rather than string compared. Missing or
// unparseable sorts oldest.
function toTime(value) {
  if (!value) return -Infinity;
  const t = Date.parse(value);
  return Number.isNaN(t) ? -Infinity : t;
}

function compareTimestampDesc(a, b) {
  const x = toTime(a);
  const y = toTime(b);
  if (x === y) return 0;
  return x > y ? -1 : 1;
}

function compareTimestampAsc(a, b) {
  return -compareTimestampDesc(a, b);
}

// Negative when a is the newer row. Ties on source_date break by fetched_at
// descending, then created_at descending.
function compareNewestFirst(a, b) {
  const byDate = compareSourceDateDesc(a.source_date, b.source_date);
  if (byDate !== 0) return byDate;
  const byFetched = compareTimestampDesc(a.fetched_at, b.fetched_at);
  if (byFetched !== 0) return byFetched;
  return compareTimestampDesc(a.created_at, b.created_at);
}

// Reduce to the newest source_date per (source, crop_key, contract_month), and
// drop held rows on the way through. This is the non-negotiable read rule, and
// the second of the two locks on held.
//
// Every selector below routes through this, so a caller that passes raw query
// data straight in still gets both rules applied. Input order is preserved for
// the surviving rows; ordering the forward curve is curveRowsForCrop's job.
export function latestPerKey(rows) {
  const newestByKey = new Map();

  for (const row of rows || []) {
    if (!row || isHeld(row)) continue;
    const key = [row.source, row.crop_key, row.contract_month ?? ""].join(
      KEY_SEPARATOR
    );
    const current = newestByKey.get(key);
    if (!current || compareNewestFirst(row, current) < 0) {
      newestByKey.set(key, row);
    }
  }

  return [...newestByKey.values()];
}

// The CPA physical price for a crop: one row, no contract month.
export function cpaRowForCrop(rows, cropKey) {
  if (!cropKey) return null;
  return (
    latestPerKey(rows).find(
      (row) => row.source === SOURCE_CPA && row.crop_key === cropKey
    ) ?? null
  );
}

// The Coffee Board spot indicator for a crop: an ICO row, which carries no
// contract month. Distinguished from the futures rows by that empty label
// rather than by crop_key, so a future source adding a month to an indicator
// cannot silently land here.
export function spotRowForCrop(rows, cropKey) {
  if (!cropKey) return null;
  return (
    latestPerKey(rows).find(
      (row) =>
        row.source === SOURCE_COFFEE_BOARD &&
        row.crop_key === cropKey &&
        !row.contract_month
    ) ?? null
  );
}

// Orders two futures rows by their contract month. Unparseable labels sort
// last, among themselves by created_at ascending, which is the order the
// refresh function first inserted them in.
function compareContractMonth(a, b) {
  const aOrder = contractMonthOrder(a.contract_month);
  const bOrder = contractMonthOrder(b.contract_month);

  if (aOrder !== null && bOrder !== null && aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  if (aOrder !== null && bOrder === null) return -1;
  if (aOrder === null && bOrder !== null) return 1;

  return compareTimestampAsc(a.created_at, b.created_at);
}

// The forward curve for a crop: every row carrying a contract month, in real
// calendar order rather than alphabetical. Sorting the labels as strings would
// give Dec, Mar, Sept and print the curve backwards.
export function curveRowsForCrop(rows, cropKey) {
  if (!cropKey) return [];
  return latestPerKey(rows)
    .filter((row) => row.crop_key === cropKey && row.contract_month)
    .sort(compareContractMonth);
}

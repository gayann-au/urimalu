import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

// The Spices Board cardamom auction, fetched apart from the main snapshots
// query.
//
// WHY A SECOND QUERY. This is the only card that needs raw. Quantity sold is
// published by the auction and stored in the raw payload, and there is no
// column for it: market_snapshots holds prices, and adding one for a quantity
// would be altering a shared table for one card. useMarketSnapshots leaves raw
// out on purpose, because agmarknet's raw is the whole hundred record response
// and pulling that for every row would cost a farmer on a hill connection real
// seconds to render six numbers. Widening that query would spend it on every
// screen; this spends nothing anywhere else.
//
// The rows still arrive through the main query too, without raw. They are
// harmless there: the board builds its cards from the six app crop keys and
// cardamom_auction is not one of them, so nothing renders twice.

const SOURCE_SPICES_BOARD = "spices_board";
const CROP_KEY_CARDAMOM_AUCTION = "cardamom_auction";

const STATUS_HELD = "held";

// Matches useMarketSnapshots. The refresh job runs once each morning, so a
// shorter window would be waste rather than freshness.
const AUCTION_STALE_TIME_MS = 15 * 60_000;

// Two rows a day, one per auctioneer. Four covers a day that gains a third
// auctioneer and still bounds the payload, since raw travels with each row.
const AUCTION_ROW_LIMIT = 4;

const AUCTION_COLUMNS =
  "source, crop_key, display_name, price_min, price_max, unit, " +
  "contract_month, source_date, validation_status, validation_note, " +
  "fetched_at, raw";

async function fetchCardamomAuction() {
  const { data, error } = await supabase
    .from("market_snapshots")
    .select(AUCTION_COLUMNS)
    .eq("source", SOURCE_SPICES_BOARD)
    .eq("crop_key", CROP_KEY_CARDAMOM_AUCTION)
    // The same non-negotiable read rule the main query enforces. Held means the
    // refresh function could not stand behind the number, so it never reaches a
    // screen, and a second query is a second place that has to say so.
    .neq("validation_status", STATUS_HELD)
    .order("source_date", { ascending: false })
    .order("fetched_at", { ascending: false })
    .limit(AUCTION_ROW_LIMIT);
  if (error) throw error;
  return data || [];
}

export function useCardamomAuction() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: qk.cardamomAuction,
    enabled: isAuthenticated,
    queryFn: fetchCardamomAuction,
    staleTime: AUCTION_STALE_TIME_MS,
  });
}

// ---------------------------------------------------------------------------
// Pure selectors. No React, no network, testable on plain arrays.
// ---------------------------------------------------------------------------

// The quantity sold across the day's auctions, or null when the row cannot say.
//
// Read from raw.day, which the refresh function writes as the total across
// every auctioneer that sold that day, not from raw.block, which is one
// auctioneer's own share. The card says "sold today", so it has to be the day.
//
// Null rather than zero when the field is missing or unreadable. Zero is a real
// answer, a day on which nothing traded, and printing it for "we do not know"
// would be stating a fact about the market that nobody published.
export function qtySoldKg(row) {
  const value = row?.raw?.day?.qty_sold_kg;
  if (value == null || value === "" || isNaN(Number(value))) return null;
  return Number(value);
}

// The row that stands for the latest auction day.
//
// Every row from one day carries the same day figures in price_min, price_max
// and raw.day, and differs only in which auctioneer it records. So the card
// needs exactly one of them, and taking the newest date is enough.
//
// The query already orders by source_date descending, and this re-checks it
// rather than trusting that order, so a later change to the query cannot
// quietly put an older auction on the card.
export function latestAuctionRow(rows) {
  let newest = null;
  for (const row of rows || []) {
    if (!row || !row.source_date) continue;
    // source_date is a date column, compared as a string on purpose:
    // YYYY-MM-DD sorts lexicographically in exact calendar order, and parsing
    // it into a timestamp would drag a timezone into a comparison with no time
    // in it. The same reasoning as compareSourceDateDesc in useMarketSnapshots.
    if (newest === null || row.source_date > newest.source_date) newest = row;
  }
  return newest;
}

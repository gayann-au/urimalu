// Read-only data lookups for price/listing questions.
//
// Given the extracted crop / market / timeframe, this runs a single SELECT
// (never a write) against the existing listings table, or price_history for
// "trend / last week" questions, and returns a compact FACTS string. Groq then
// phrases the answer from those exact facts. No AI is involved in the query.
//
// Safety notes:
//   - The service-role client is used so the lookup is not blocked by RLS, but
//     every query re-applies the same "approved, non-disabled merchant" filter
//     the public feed uses, so the assistant never surfaces a listing the feed
//     would hide.
//   - The crop ILIKE patterns and the market value come only from the fixed
//     catalog in catalog.ts, never from raw user text, so there is no injection
//     surface in the .or()/.ilike() filters below.

import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import type { CropMatch, MarketMatch, Timeframe } from "./catalog.ts";

export interface FactsResult {
  facts: string; // "" when nothing matched
  count: number;
}

// Columns pulled for a current-listing answer, with the merchant embedded via
// the listings.merchant_id -> users.id relationship. !inner drops any listing
// whose merchant does not pass the approved/non-disabled filter.
const CURRENT_COLS =
  "crop_name, price, unit_label, unit_kg, price_per_kg, call_for_price, confirmed_at, updated_at, valid_till, " +
  "users!inner(business_name, town, district, role, status, is_disabled)";

const HISTORY_COLS =
  "crop_name, price, price_per_kg, recorded_at, " +
  "users!inner(business_name, town, district, role, status, is_disabled)";

const MAX_ROWS = 14;

function rupees(v: number | null | undefined): string | null {
  if (v == null || isNaN(Number(v))) return null;
  return "Rs " + Math.round(Number(v));
}

// Just the date part of a timestamp (YYYY-MM-DD), or "" when absent. Avoids
// leaking a full timestamp / timezone into the facts.
function dateOnly(ts: string | null | undefined): string {
  if (!ts) return "";
  const s = String(ts);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : "";
}

// Build the OR filter for the crop patterns, e.g.
//   crop_name.ilike.%robusta%,crop_name.ilike.%arabica%
function cropOrFilter(crop: CropMatch): string {
  return crop.patterns.map((p) => `crop_name.ilike.%${p}%`).join(",");
}

// deno-lint-ignore no-explicit-any
function applyMarket(query: any, market: MarketMatch | null): any {
  if (!market) return query;
  if (market.field === "district") return query.eq("users.district", market.value);
  return query.ilike("users.town", `%${market.value}%`);
}

// One merchant row -> one fact line for a current listing.
function currentLine(row: Record<string, unknown>): string {
  const m = (row.users ?? {}) as Record<string, unknown>;
  const where = [m.town, m.district].filter(Boolean).join(", ");
  const at = `${m.business_name ?? "a merchant"}${where ? ` (${where})` : ""}`;
  const crop = String(row.crop_name ?? "Crop");

  if (row.call_for_price) return `${crop} at ${at}: call for price`;

  const perKg = rupees(row.price_per_kg as number);
  const price = rupees(row.price as number);
  const unit = String(row.unit_label ?? "").trim();
  const when = dateOnly((row.confirmed_at as string) ?? (row.updated_at as string));

  let money: string;
  if (price && unit && unit.toLowerCase() !== "per kg") {
    money = `${price} per ${unit}${perKg ? ` (${perKg}/kg)` : ""}`;
  } else if (perKg) {
    money = `${perKg}/kg`;
  } else if (price) {
    money = price;
  } else {
    money = "price not set";
  }
  return `${crop} at ${at}: ${money}${when ? `, updated ${when}` : ""}`;
}

// One price_history row -> one fact line.
function historyLine(row: Record<string, unknown>): string {
  const m = (row.users ?? {}) as Record<string, unknown>;
  const where = [m.town, m.district].filter(Boolean).join(", ");
  const at = `${m.business_name ?? "a merchant"}${where ? ` (${where})` : ""}`;
  const crop = String(row.crop_name ?? "Crop");
  const perKg = rupees(row.price_per_kg as number) ?? rupees(row.price as number) ?? "n/a";
  const when = dateOnly(row.recorded_at as string);
  return `${crop} at ${at}: ${perKg}/kg on ${when}`;
}

// Current active listings for the crop (and market, if given).
async function fetchCurrent(
  client: SupabaseClient,
  crop: CropMatch,
  market: MarketMatch | null,
): Promise<FactsResult> {
  let query = client
    .from("listings")
    .select(CURRENT_COLS)
    .eq("is_active", true)
    .eq("users.role", "MERCHANT")
    .eq("users.status", "APPROVED")
    .eq("users.is_disabled", false)
    .or(cropOrFilter(crop))
    .order("price_per_kg", { ascending: true, nullsFirst: false })
    .limit(MAX_ROWS);

  query = applyMarket(query, market);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return { facts: "", count: 0 };

  const lines = rows.map((r: Record<string, unknown>) => currentLine(r));
  return { facts: lines.join("\n"), count: rows.length };
}

// Historical snapshots over the last N days for the crop (and market).
async function fetchHistory(
  client: SupabaseClient,
  crop: CropMatch,
  market: MarketMatch | null,
  days: number,
): Promise<FactsResult> {
  const sinceISO = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  let query = client
    .from("price_history")
    .select(HISTORY_COLS)
    .gte("recorded_at", sinceISO)
    .eq("users.role", "MERCHANT")
    .eq("users.status", "APPROVED")
    .eq("users.is_disabled", false)
    .or(cropOrFilter(crop))
    .order("recorded_at", { ascending: false })
    .limit(MAX_ROWS * 2);

  query = applyMarket(query, market);

  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return { facts: "", count: 0 };

  const lines = rows.slice(0, MAX_ROWS).map((r: Record<string, unknown>) => historyLine(r));
  return { facts: lines.join("\n"), count: rows.length };
}

// Entry point: pick current vs. history based on the timeframe and return the
// facts string for the model to phrase.
export async function lookupFacts(
  client: SupabaseClient,
  crop: CropMatch,
  market: MarketMatch | null,
  timeframe: Timeframe,
): Promise<FactsResult> {
  if (timeframe.kind === "history") {
    return await fetchHistory(client, crop, market, timeframe.days);
  }
  return await fetchCurrent(client, crop, market);
}

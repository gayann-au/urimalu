// Intent detection: decide whether a real question is about crop prices /
// listings (answerable from the database) or a general question (answered by
// Groq from its own knowledge). Pure rule-based logic, no AI.
//
// A question is treated as a price/listing question when it names a crop we
// recognise. The database path only runs when a crop is actually identified,
// because a listings lookup with no crop filter is not a meaningful "exact row"
// answer; a price-flavoured question with no crop is handed to the general path
// so the model can ask which crop they mean.

import { extractCrop, extractMarket, extractTimeframe } from "./catalog.ts";
import type { CropMatch, MarketMatch, Timeframe } from "./catalog.ts";

export interface Intent {
  // "data" -> query listings/price_history then have Groq phrase the facts.
  // "general" -> Groq answers directly (still behind the guardrail layer).
  kind: "data" | "general";
  crop: CropMatch | null;
  market: MarketMatch | null;
  timeframe: Timeframe;
  // True when the user used price wording, even if no crop was found. Lets the
  // general path nudge the model to ask which crop they mean.
  priceIntentWithoutCrop: boolean;
}

// Price intent is read in two tiers, because one loose word is not evidence.
//
// This only feeds priceIntentWithoutCrop, the flag that makes the general path
// ask "which crop do you mean?". Whether a question reaches the database path
// is decided by extractCrop alone, so nothing here can send a price question
// down the wrong road; it can only produce a pointless nudge.
//
// STRONG: vocabulary nobody uses in this app except to ask for a number. One
// hit is enough. "going rate" needs no entry of its own because "rate" already
// matches it.
const STRONG_PRICE_WORDS =
  /\b(price|prices|pricing|rate|rates|cost|costs|quote|quotes|how much|per\s*kg|quintal)\b/i;

// LOOSE: ordinary English that happens to involve money. "Is Urimalu worth
// using", "how do I pay for this app" and "how do I post a listing" all contain
// one of these and not one of them wants a crop price. On their own they mean
// nothing.
const LOOSE_MONEY_WORDS =
  /\b(worth|pay|pays|paying|paid|offer|offers|offering|offered|sell|sells|selling|buy|buys|buying|market|markets|listing|listings|deal|deals)\b/i;

// What turns a loose money word into a real price question: someone who trades,
// or something that gets traded and weighed. "What are merchants paying" is a
// price question; "is it worth using" is not.
const MARKET_SUBJECT_WORDS =
  /\b(merchant|merchants|trader|traders|buyer|buyers|seller|sellers|dealer|dealers|mandi|crop|crops|produce|kg|kilo|kilos|bag|bags|rupee|rupees|rs)\b/i;

// True when the message is asking for a price figure, by either route.
function hasPriceIntent(message: string): boolean {
  if (STRONG_PRICE_WORDS.test(message)) return true;
  return LOOSE_MONEY_WORDS.test(message) && MARKET_SUBJECT_WORDS.test(message);
}

export function detectIntent(message: string): Intent {
  const crop = extractCrop(message);
  const market = extractMarket(message);
  const timeframe = extractTimeframe(message);
  const hasPriceWord = hasPriceIntent(message);

  // The database path needs a concrete crop to look up. A crop reference alone
  // is enough (e.g. "pepper?"); price words without a crop stay general.
  const kind: Intent["kind"] = crop ? "data" : "general";

  return { kind, crop, market, timeframe, priceIntentWithoutCrop: !crop && hasPriceWord };
}

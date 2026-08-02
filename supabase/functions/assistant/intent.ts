// Vocabulary extraction for a real question: which crop, which market, which
// timeframe, and whether the wording is asking for a price figure. Pure
// rule-based logic, no AI.
//
// This file deliberately does NOT decide which tier answers. It reports what it
// can see in the words; router.ts decides what that means. Keeping the two
// apart is what stopped "contains the token coffee" from being the same thing
// as "wants a coffee price".

import { extractCrop, extractMarket, extractTimeframe } from "./catalog.ts";
import type { CropMatch, MarketMatch, Timeframe } from "./catalog.ts";

export interface Intent {
  crop: CropMatch | null;
  market: MarketMatch | null;
  timeframe: Timeframe;
}

// Price wording is read in two tiers, because one loose word is not evidence.
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

// True when the wording is asking for a price figure.
//
// cropNamed is passed in rather than recomputed because a named traded crop is
// itself a market subject: "what listings are there for coffee" is a price
// question even though "coffee" is not in MARKET_SUBJECT_WORDS.
export function hasPriceIntent(message: string, cropNamed: boolean): boolean {
  if (STRONG_PRICE_WORDS.test(message)) return true;
  if (!LOOSE_MONEY_WORDS.test(message)) return false;
  return cropNamed || MARKET_SUBJECT_WORDS.test(message);
}

// Pull the catalog references out of a message. No judgement, just extraction.
export function detectIntent(message: string): Intent {
  return {
    crop: extractCrop(message),
    market: extractMarket(message),
    timeframe: extractTimeframe(message),
  };
}

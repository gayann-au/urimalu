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

// Words that signal the user is asking about price/market activity even if they
// phrase it loosely.
const PRICE_WORDS =
  /\b(price|prices|rate|rates|cost|costs|how much|selling|buying|buy|sell|per\s*kg|quintal|market|listing|listings|quote|quotes)\b/i;

export function detectIntent(message: string): Intent {
  const crop = extractCrop(message);
  const market = extractMarket(message);
  const timeframe = extractTimeframe(message);
  const hasPriceWord = PRICE_WORDS.test(message);

  // The database path needs a concrete crop to look up. A crop reference alone
  // is enough (e.g. "pepper?"); price words without a crop stay general.
  const kind: Intent["kind"] = crop ? "data" : "general";

  return { kind, crop, market, timeframe, priceIntentWithoutCrop: !crop && hasPriceWord };
}

// Crop and market catalogue + rule-based extraction.
//
// This deliberately DUPLICATES a subset of src/lib/constants.js (CROP_CATALOG,
// DISTRICTS, DELIVERY_POINTS). The Edge Function runs on Deno and cannot import
// from the Vite/React src tree, so the reference data it needs to recognise a
// crop or a market is embedded here. If the frontend catalogue grows, mirror the
// additions here. No AI is involved in any of this: it is plain string matching.
//
// The extractors turn a free-text question into structured filters:
//   - a crop -> ILIKE patterns matched against listings.crop_name
//   - a market -> a users.district value or a users.town value
//   - a timeframe -> current listings vs. price_history over N days

// ---------- Crops ----------

export interface CropMatch {
  // Human label used when phrasing the answer.
  label: string;
  // ILIKE substring patterns applied to listings.crop_name. Multiple patterns
  // are OR-ed, so a broad term like "coffee" can pull both robusta and arabica.
  patterns: string[];
}

interface CropEntry {
  label: string;
  aliases: string[];
  patterns: string[];
}

// Ordered from broad to specific; matching picks the entry whose matched alias
// is longest, so "robusta cherry" beats the broad "robusta" / "coffee".
const CROPS: CropEntry[] = [
  { label: "coffee", aliases: ["coffee"], patterns: ["robusta", "arabica"] },
  { label: "robusta", aliases: ["robusta"], patterns: ["robusta"] },
  { label: "arabica", aliases: ["arabica"], patterns: ["arabica"] },
  { label: "black pepper", aliases: ["pepper", "black pepper", "kali mirch", "karimenasu", "menasu"], patterns: ["pepper"] },
  { label: "cardamom", aliases: ["cardamom", "elaichi", "elakki"], patterns: ["cardamom"] },
  { label: "arecanut", aliases: ["arecanut", "areca", "betel nut", "supari", "adike", "adke"], patterns: ["arecanut"] },
  { label: "light berries", aliases: ["light berries", "light berry"], patterns: ["light berr"] },
  { label: "Robusta Cherry", aliases: ["robusta cherry", "rc"], patterns: ["robusta cherry"] },
  { label: "Robusta Cherry EP", aliases: ["robusta cherry ep"], patterns: ["robusta cherry ep"] },
  { label: "Robusta Parchment", aliases: ["robusta parchment", "rp"], patterns: ["robusta parchment"] },
  { label: "Arabica Cherry", aliases: ["arabica cherry", "ac"], patterns: ["arabica cherry"] },
  { label: "Arabica Cherry EP", aliases: ["arabica cherry ep"], patterns: ["arabica cherry ep"] },
  { label: "Arabica Parchment", aliases: ["arabica parchment", "ap"], patterns: ["arabica parchment"] },
  { label: "Black Pepper Grade 1", aliases: ["black pepper grade 1", "pepper grade 1", "bp1"], patterns: ["black pepper grade 1"] },
  { label: "Black Pepper Grade 2", aliases: ["black pepper grade 2", "pepper grade 2", "bp2"], patterns: ["black pepper grade 2"] },
];

// ---------- Markets ----------
// "Market" in this app is where the merchant is, since listings carry no
// location of their own. A market resolves to either a users.district value or
// a users.town value.

export interface MarketMatch {
  label: string;
  field: "district" | "town";
  value: string;
}

interface MarketEntry {
  label: string;
  field: "district" | "town";
  value: string;
  aliases: string[];
}

const MARKETS: MarketEntry[] = [
  // Districts (from DISTRICTS in constants.js). "Coorg" is the common name for
  // Kodagu, so it is an alias.
  { label: "Kodagu", field: "district", value: "Kodagu", aliases: ["kodagu", "coorg"] },
  { label: "Chikmagalur", field: "district", value: "Chikmagalur", aliases: ["chikmagalur", "chikkamagaluru", "chickmagalur"] },
  { label: "Hassan", field: "district", value: "Hassan", aliases: ["hassan"] },
  // Towns / delivery points (from DELIVERY_POINTS in constants.js).
  { label: "Virajpet", field: "town", value: "Virajpet", aliases: ["virajpet", "virajpete"] },
  { label: "Gonikoppal", field: "town", value: "Gonikoppal", aliases: ["gonikoppal", "gonikoppa"] },
  { label: "Kushalnagar", field: "town", value: "Kushalnagar", aliases: ["kushalnagar", "kushalnagara"] },
  { label: "Madikeri", field: "town", value: "Madikeri", aliases: ["madikeri", "mercara"] },
  { label: "Somwarpet", field: "town", value: "Somwarpet", aliases: ["somwarpet", "somvarpet"] },
  { label: "Ponnampet", field: "town", value: "Ponnampet", aliases: ["ponnampet"] },
  { label: "Suntikoppa", field: "town", value: "Suntikoppa", aliases: ["suntikoppa"] },
];

// ---------- Timeframe ----------

export interface Timeframe {
  // "current" reads live listings; "history" reads price_history over `days`.
  kind: "current" | "history";
  days: number;
}

// ---------- Matching helpers ----------

// Normalise a message for matching: lowercase, punctuation to spaces, collapse
// whitespace, pad with spaces so whole-token checks are simple includes.
function normalise(message: string): string {
  return " " + message.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim() + " ";
}

// Does `term` appear in the normalised haystack as a whole token/phrase? The
// surrounding spaces mean short trade codes like "rc" or "ap" match only as a
// standalone word, never as letters buried inside another word.
function containsTerm(haystack: string, term: string): boolean {
  const t = term.toLowerCase();
  return haystack.includes(" " + t + " ");
}

// Extract the crop referenced in the message, or null. Picks the entry with the
// longest matched alias so specific crop names win over broad category words.
export function extractCrop(message: string): CropMatch | null {
  const hay = normalise(message);
  let best: { entry: CropEntry; len: number } | null = null;
  for (const entry of CROPS) {
    for (const alias of entry.aliases) {
      if (containsTerm(hay, alias) && (!best || alias.length > best.len)) {
        best = { entry, len: alias.length };
      }
    }
  }
  return best ? { label: best.entry.label, patterns: best.entry.patterns } : null;
}

// Extract the market referenced in the message, or null. Longest alias wins so
// a specific town beats nothing broader (districts and towns do not overlap).
export function extractMarket(message: string): MarketMatch | null {
  const hay = normalise(message);
  let best: { entry: MarketEntry; len: number } | null = null;
  for (const entry of MARKETS) {
    for (const alias of entry.aliases) {
      if (containsTerm(hay, alias) && (!best || alias.length > best.len)) {
        best = { entry, len: alias.length };
      }
    }
  }
  return best ? { label: best.entry.label, field: best.entry.field, value: best.entry.value } : null;
}

// Extract the timeframe. Defaults to current listings. History words widen the
// window: "yesterday" -> 2 days of history, "last week" / "trend" -> 7 days.
export function extractTimeframe(message: string): Timeframe {
  const hay = normalise(message);
  if (containsTerm(hay, "last week") || containsTerm(hay, "past week") || containsTerm(hay, "this week") ||
      containsTerm(hay, "trend") || containsTerm(hay, "history") || containsTerm(hay, "7 days")) {
    return { kind: "history", days: 7 };
  }
  if (containsTerm(hay, "yesterday") || containsTerm(hay, "last few days") || containsTerm(hay, "recently")) {
    return { kind: "history", days: 2 };
  }
  return { kind: "current", days: 0 };
}

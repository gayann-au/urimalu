// Crop and unit metadata for the market strip.
//
// Three things live here because all three are keyed on what the source
// actually stored, and splitting them would let one drift from the others:
// the unit gloss map, the price formatter, and the temporary bridge between
// app crop names and market crop keys.
//
// The number and its unit are one decision, which is why the formatter sits
// beside the gloss map rather than in constants.js. Every price in this
// feature goes through formatMarketPrice. No market component calls formatINR
// directly.

import { formatINR } from "./constants";

// i18n keys for the plain-words gloss under the price line, keyed on the
// exact unit string as stored in market_snapshots.unit. Four entries today.
//
// Matching is exact: no trimming, no case folding. A unit that differs by so
// much as a space is a unit this map has not been taught, and saying so is the
// point. The gloss restates the stored token in words and computes nothing, so
// "for every 50 kg" may only ever appear beside a token that already says 50.
const UNIT_GLOSS_KEYS = {
  "INR/50kg": "market.unitGloss.per50kg",
  "INR/kg": "market.unitGloss.perKg",
  "USc/lb": "market.unitGloss.uscLb",
  "USD/ton": "market.unitGloss.usdTon",
};

// The gloss key for a stored unit, or null when the unit is not one of the
// four known strings.
//
// An unknown unit gets no gloss. Not a guessed one, not a generic one. If a
// source starts sending INR/quintal it renders as a bare unglossed token,
// which is honest and looks unfinished enough to prompt someone to add it,
// rather than a confident sentence that is wrong. This guardrail is what makes
// showing a gloss safe at all, so it is held firmly: the only way to add a
// gloss is to add an entry above.
export function unitGlossKey(unit) {
  if (!unit) return null;
  return UNIT_GLOSS_KEYS[unit] ?? null;
}

// Format a market price for display, switching on the stored unit string and
// never on the source or the crop key.
//
//   INR/50kg   delegate to formatINR    9400    -> ₹9,400
//   INR/kg     delegate to formatINR    3352    -> ₹3,352
//   USc/lb     two decimals, no symbol  323.05  -> 323.05
//   USD/ton    whole, no symbol         3780    -> 3,780
//   anything else                       raw value as stored
//
// formatINR alone is wrong for the eight coffee_board rows on two counts at
// once. It prefixes the rupee sign, but USc/lb is US cents and USD/ton is US
// dollars, so the symbol states a falsehood about what the number is. And it
// passes maximumFractionDigits: 0, which turns 323.05 into 323 on a three
// digit quote where the source published those decimals and they carry real
// meaning. That error would have shipped looking entirely plausible: a rupee
// sign in front of 323 beside "ICE, New York" looks fine to anyone not
// checking the currency.
//
// The currency is carried by the unit token rendered beside the number, not by
// a symbol baked into the figure, which is why the two non-rupee units need no
// symbol of their own.
//
// An unrecognised unit returns the value unformatted, the same fail-safe as
// the gloss map: plain rather than polished under a guess.
export function formatMarketPrice(value, unit) {
  // Matches formatINR's own missing-value output, so a blank price reads
  // identically whatever unit the row carries.
  if (value == null || value === "" || isNaN(Number(value))) return "-";

  switch (unit) {
    case "INR/50kg":
    case "INR/kg":
      return formatINR(value);
    case "USc/lb":
      return Number(value).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case "USD/ton":
      return Number(value).toLocaleString("en-IN", {
        maximumFractionDigits: 0,
      });
    default:
      return String(value);
  }
}

// Sortable integer for a futures contract month label, or null when the label
// cannot be parsed.
//
// contract_month is free text and there is no sequence column, so the UI has to
// derive the order. Sorting the labels as strings gives Dec, Mar, Sept, which
// is the wrong order for Sept-2026, Dec-2026, Mar-2027 and would present the
// forward curve backwards. year * 12 + monthIndex puts them in real order and
// keeps working across the year boundary, which a month-only key would not.
//
// The source writes the non-standard "Sept". Matching is on the first three
// letters of an all-alphabetic month token, so Sep, Sept and September all
// resolve to the same month rather than only the spelling in use today.
//
// A label that does not parse returns null. The caller sorts those last by
// created_at ascending rather than guessing at a position, which is the order
// the refresh function first inserted them in.
const CONTRACT_MONTH_INDEX = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

export function contractMonthOrder(label) {
  if (!label) return null;
  const parts = String(label).trim().match(/^([A-Za-z]+)[\s-]*(\d{4})$/);
  if (!parts) return null;

  const monthIndex = CONTRACT_MONTH_INDEX[parts[1].slice(0, 3).toLowerCase()];
  if (monthIndex === undefined) return null;

  return Number(parts[2]) * 12 + monthIndex;
}

// TEMPORARY. The app and the sources name the same crop differently: a farmer
// lists "Robusta Cherry EP" and CPA publishes "Robusta Cherry". The
// market_snapshots.app_crop_names column exists to hold this mapping on the
// row itself, but it is null on all 14 rows, so the mapping lives here in the
// meantime.
//
// DELETE THIS MAP AND marketCropKeyForAppCrop WHEN app_crop_names IS
// BACKFILLED. The shape below is deliberately the shape of that column, crop
// key to a list of app crop names, so the backfill is a lift rather than a
// rewrite and the deletion is a swap. This is the only copy of the mapping in
// the client; nothing else should hardcode a crop name pairing.
//
// Light Berries and Arecanut are absent on purpose. CPA publishes no row for
// either, so a lookup returns null and the caller shows no market price. That
// is correct: the alternative is borrowing a neighbouring crop's number and
// presenting it as theirs.
export const MARKET_CROP_APP_NAMES = {
  arabica_parchment: ["Arabica Parchment"],
  arabica_cherry: ["Arabica Cherry", "Arabica Cherry EP"],
  robusta_parchment: ["Robusta Parchment"],
  robusta_cherry: ["Robusta Cherry", "Robusta Cherry EP"],
  pepper: ["Black Pepper Grade 1", "Black Pepper Grade 2"],
  cardamom: ["Cardamom"],
};

// Reverse index, built once at module load from the map above so the two can
// never disagree.
const APP_CROP_TO_MARKET_KEY = new Map();
for (const [cropKey, appNames] of Object.entries(MARKET_CROP_APP_NAMES)) {
  for (const appName of appNames) {
    APP_CROP_TO_MARKET_KEY.set(appName.toLowerCase(), cropKey);
  }
}

// The market crop key for an app crop name, or null when that crop has no
// market row. Tolerant of surrounding whitespace and casing, since listing
// crop names are stored as text, but it never guesses at a near match.
export function marketCropKeyForAppCrop(appCropName) {
  if (!appCropName) return null;
  const normalised = String(appCropName).trim().toLowerCase();
  return APP_CROP_TO_MARKET_KEY.get(normalised) ?? null;
}

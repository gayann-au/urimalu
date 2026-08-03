// Turning weather numbers into plain words. Pure, no React, no network.
//
// Two jobs, both keyed on what the vendor actually sends:
//   a WMO weather code   -> an i18n key for the condition in plain words
//   a rainfall total     -> an i18n key and a band for how much rain that is
//
// Neither function ever guesses. An unrecognised code returns null and the
// caller shows the temperature with no condition beside it, the same refusal
// unitGlossKey makes in marketCrops.js. A sentence invented for a code we were
// not taught is a statement about the sky that nobody checked.

// The WMO 4677 present-weather codes as Open-Meteo publishes them, complete.
//
// The snow and freezing entries will never fire in Kodagu. They are here
// because this is the vendor's whole vocabulary, and a half-copied map is the
// thing that turns an unexpected code into a blank where a condition should
// be. Copying all of it costs two dozen lines once.
const WEATHER_CODE_KEYS = {
  0: "weather.code.clear",
  1: "weather.code.mainlyClear",
  2: "weather.code.partlyCloudy",
  3: "weather.code.overcast",
  45: "weather.code.fog",
  48: "weather.code.rimeFog",
  51: "weather.code.drizzleLight",
  53: "weather.code.drizzleModerate",
  55: "weather.code.drizzleDense",
  56: "weather.code.freezingDrizzleLight",
  57: "weather.code.freezingDrizzleDense",
  61: "weather.code.rainSlight",
  63: "weather.code.rainModerate",
  65: "weather.code.rainHeavy",
  66: "weather.code.freezingRainLight",
  67: "weather.code.freezingRainHeavy",
  71: "weather.code.snowSlight",
  73: "weather.code.snowModerate",
  75: "weather.code.snowHeavy",
  77: "weather.code.snowGrains",
  80: "weather.code.showersSlight",
  81: "weather.code.showersModerate",
  82: "weather.code.showersViolent",
  85: "weather.code.snowShowersSlight",
  86: "weather.code.snowShowersHeavy",
  95: "weather.code.thunderstorm",
  96: "weather.code.thunderstormHailSlight",
  99: "weather.code.thunderstormHailHeavy",
};

// The i18n key for a WMO code, or null when the code is not one we were taught.
//
// Number() rather than a bare lookup because the code arrives from JSON and a
// string "61" must find the same entry as the number 61. hasOwnProperty guards
// the prototype the way labelKeyFor does in DataAgeLine, since the value is
// data off the wire.
export function weatherCodeKey(code) {
  if (code == null || code === "") return null;
  const n = Number(code);
  if (!Number.isFinite(n)) return null;
  return Object.prototype.hasOwnProperty.call(WEATHER_CODE_KEYS, n)
    ? WEATHER_CODE_KEYS[n]
    : null;
}

// Rain bands, in millimetres over a three day window.
//
// Tuned for Kodagu in the monsoon, not for a general climate. Thirty five
// millimetres in a day is an ordinary wet day here, so a three day total under
// 25 is genuinely a light stretch and 100 and over is a heavy one. Bands set
// for a dry district would put every reading in the top band all season and
// tell the reader nothing.
const RAIN_LIGHT_MAX_MM = 25;
const RAIN_STEADY_MAX_MM = 100;

// { band, key } for a rainfall total, or null when there is no usable total.
//
// A missing sum is not zero rain. Zero is a measurement and null is the
// absence of one, and printing "no rain" over a gap in the feed would be an
// invented forecast. The caller omits the figure instead.
export function rainBand(mm) {
  if (mm == null || mm === "" || isNaN(Number(mm))) return null;
  const total = Number(mm);
  if (total < 0) return null;

  if (total === 0) return { band: "dry", key: "weather.rain.dry" };
  if (total < RAIN_LIGHT_MAX_MM) return { band: "light", key: "weather.rain.light" };
  if (total < RAIN_STEADY_MAX_MM) return { band: "steady", key: "weather.rain.steady" };
  return { band: "heavy", key: "weather.rain.heavy" };
}

// The dot colour for a rain band.
//
// COLOUR RULE. This is the only colour in the market feature that carries
// meaning, and it means how much rain, never whether a price is good. It is
// also never the only channel: every dot renders beside its own plain-words
// label and its own number in ink, so a reader who cannot separate the hues
// loses nothing. That is why the colour sits on a small dot and not on the
// figure itself, where chilli and ember would both fail contrast on paper.
//
// Project tokens only, and no raw green or red anywhere.
const RAIN_BAND_DOTS = {
  dry: "bg-ink-300",
  light: "bg-crop-400",
  steady: "bg-ember-400",
  heavy: "bg-chilli-600",
};

export function rainDotClass(band) {
  return RAIN_BAND_DOTS[band] ?? "bg-ink-300";
}

// A rainfall total for display: one decimal, or null when there is nothing to
// show. Open-Meteo publishes precipitation_sum to two decimals, which is more
// precision than a three day total earns; one keeps 0.4 mm distinguishable
// from nothing without pretending to hundredths of a millimetre.
export function formatRainMm(mm) {
  if (mm == null || mm === "" || isNaN(Number(mm))) return null;
  return Number(mm).toLocaleString("en-IN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

// A temperature for display: whole degrees, or null when there is none.
// Open-Meteo sends one decimal. A farmer deciding whether to spread coffee on
// the drying yard does not need the tenth, and dropping it keeps the figure
// readable at the size this card prints it.
export function formatTemperature(celsius) {
  if (celsius == null || celsius === "" || isNaN(Number(celsius))) return null;
  return String(Math.round(Number(celsius)));
}

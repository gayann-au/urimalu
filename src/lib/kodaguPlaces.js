// Coordinates for the seven Kodagu towns the weather card can report on, and
// the lookup that turns a stored town name into a place to fetch weather for.
//
// WHY THERE IS A FALLBACK AT ALL. users.town is collected from merchants only:
// OnboardingFarmerForm.jsx asks for full name, phone and district, never a
// town, so for farmers, who are the primary audience for this card, town is
// null. users.district is too coarse to use, being one of Kodagu, Chikmagalur,
// Hassan or Other, which is not a point and is not always Kodagu. There is no
// taluk column and no location column. So most readers of this card will land
// on the fallback, and that is correct behaviour rather than a gap to close by
// guessing at a coordinate.
//
// WHAT THE CALLER MUST DO WITH THE RESULT. The returned name is the place the
// numbers are actually for, never the reader's own location. A farmer in
// Virajpet whose town we do not know is shown Madikeri weather and told it is
// Madikeri weather, with the weather.fallbackNote line beside it. Never print
// a user's town over coordinates that are not that town's, and never imply the
// reading is local to them when isFallback is true.

// Approximate town centres. Every pair below was taken from the Open-Meteo
// geocoding API on 2 August 2026, the same vendor as the forecast endpoint the
// weather card calls, so the coordinates and the forecast come from one source:
//
//   https://geocoding-api.open-meteo.com/v1/search?name=Madikeri&count=10&language=en&format=json
//
// Each name was queried on its own and the result filtered to admin1
// "Karnataka" and admin2 "Coorg", which is the district's older name in that
// dataset. That filter is load bearing: Kushalnagar also matches a town in
// Bangladesh, Somwarpet matches one in Telangana, Ponnampet matches one in
// Andhra Pradesh, and Suntikoppa matches two more in Shimoga District. Values
// are recorded to the digit as returned, not rounded, because rounding a
// sourced number turns it back into an approximation.
//
// The API's own transliterations differ from ours in three cases: it returns
// Kushalnagar and Somwarpet with macrons and spells the latter Somvarpet. The
// keys below are the app's spellings, taken from DELIVERY_POINTS, because that
// is what users.town is matched against. Lookup never touches the API's names.
//
// The keys must stay in step with DELIVERY_POINTS in constants.js. A delivery
// point added there without a pair added here is not a crash: it simply falls
// back to Madikeri, which is the safe direction to fail in.
export const KODAGU_PLACES = {
  Virajpet: { lat: 12.19644, lon: 75.80512 },
  Gonikoppal: { lat: 12.18302, lon: 75.92943 },
  Kushalnagar: { lat: 12.45795, lon: 75.95904 },
  Madikeri: { lat: 12.42602, lon: 75.7382 },
  Somwarpet: { lat: 12.59698, lon: 75.84957 },
  Ponnampet: { lat: 12.14473, lon: 75.94514 },
  Suntikoppa: { lat: 12.45594, lon: 75.8297 },
};

// The place used whenever the reader's town is unknown or unrecognised.
// Madikeri is the district headquarters, which makes it the least misleading
// stand-in, but the card still says Madikeri rather than pretending otherwise.
export const FALLBACK_PLACE_NAME = "Madikeri";

// Case-insensitive index, built once at module load from the table above so
// the two cannot disagree.
const PLACES_BY_LOWER_NAME = new Map();
for (const [name, coords] of Object.entries(KODAGU_PLACES)) {
  PLACES_BY_LOWER_NAME.set(name.toLowerCase(), { name, ...coords });
}

const FALLBACK_PLACE = PLACES_BY_LOWER_NAME.get(
  FALLBACK_PLACE_NAME.toLowerCase()
);

// The place to fetch weather for, given a stored town name.
//
// Returns { name, lat, lon, isFallback }. A recognised town gives its own
// coordinates with isFallback false. Null, empty, whitespace, an unmatched
// free text town, or a town outside Kodagu all give Madikeri with isFallback
// true. Matching is case-insensitive and tolerates surrounding whitespace,
// since town is free text, but it never guesses at a near match: an
// unrecognised town falls back rather than being interpolated to the nearest
// known point.
export function placeForTown(town) {
  const normalised = String(town ?? "").trim().toLowerCase();
  const match = normalised ? PLACES_BY_LOWER_NAME.get(normalised) : undefined;
  if (match) return { ...match, isFallback: false };
  return { ...FALLBACK_PLACE, isFallback: true };
}

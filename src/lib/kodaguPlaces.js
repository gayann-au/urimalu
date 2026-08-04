// Coordinates for the Kodagu towns the weather card can report on, and the
// lookup that turns a stored town name into a place to fetch weather for.
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
// geocoding API, the same vendor as the forecast endpoint the weather card
// calls, so the coordinates and the forecast come from one source:
//
//   https://geocoding-api.open-meteo.com/v1/search?name=Madikeri&count=10&country=IN
//
// NOT ONE OF THESE NUMBERS WAS TYPED FROM MEMORY. Each name was queried on its
// own and the results kept only when admin2 was the district, spelled "Coorg"
// in that dataset, or when the point fell inside the Kodagu bounding box of
// 11.9 to 12.9 north and 75.4 to 76.3 east. Every pair below cleared the admin2
// test, so the bounding box never had to stand alone for any of them.
//
// That filter is load bearing. Kushalnagar also matches a town in Bangladesh,
// Somwarpet matches one in Telangana, Ponnampet matches one in Andhra Pradesh,
// and Suntikoppa matches two more in Shimoga District. A wrong decimal here
// does not break anything on screen: it quietly reports one valley's rain under
// another valley's name, which is the failure this whole file exists to stop.
// Values are recorded to the digit as returned, not rounded, because rounding a
// sourced number turns it back into an approximation.
//
// The first seven were resolved on 2 August 2026 and the rest on 4 August 2026.
// The seven were re-queried on the second date and came back identical, so the
// table below is one consistent read of the vendor rather than two.
//
// SPELLING. The keys are the app's spellings, because users.town is matched
// against them, and the vendor's transliteration is often not ours: it returns
// Kushalnagar and Somwarpet with macrons and spells the latter Somvarpet.
// Lookup never touches the API's names. Two towns resolved only under the
// vendor's spelling and are noted inline, so a later reader can re-run the same
// query and land on the same row.
//
// The keys must stay in step with DELIVERY_POINTS in constants.js. A delivery
// point added there without a pair added here is not a crash: it simply falls
// back to Madikeri, which is the safe direction to fail in. The reverse is
// fine and is the case today: most of the towns below are weather-only and are
// not places anything is delivered to.
export const KODAGU_PLACES = {
  // The seven that were here first, in their original order.
  Virajpet: { lat: 12.19644, lon: 75.80512 },
  Gonikoppal: { lat: 12.18302, lon: 75.92943 },
  Kushalnagar: { lat: 12.45795, lon: 75.95904 },
  Madikeri: { lat: 12.42602, lon: 75.7382 },
  Somwarpet: { lat: 12.59698, lon: 75.84957 },
  Ponnampet: { lat: 12.14473, lon: 75.94514 },
  Suntikoppa: { lat: 12.45594, lon: 75.8297 },
  // Added 4 August 2026, same vendor, same filter.
  Napoklu: { lat: 12.30828, lon: 75.68841 },
  Bhagamandala: { lat: 12.38787, lon: 75.52946 },
  Srimangala: { lat: 12.01912, lon: 75.98914 },
  Kutta: { lat: 11.97137, lon: 76.04805 },
  Kodlipet: { lat: 12.80087, lon: 75.88662 },
  Titimati: { lat: 12.22399, lon: 76.00296 },
  Kakkabe: { lat: 12.2581, lon: 75.64326 },
  // The vendor returned two Hudikeri rows, 12.08485,75.94232 and
  // 12.09146,75.93515, both in Coorg and about 900 metres apart. The first is
  // kept. Which of the two is the town centre is not something this file can
  // establish, and averaging two sourced points would produce a third that the
  // vendor never published.
  Hudikeri: { lat: 12.08485, lon: 75.94232 },
  // Queried as "Siddapura". Plain "Siddapur" returns ten Indian towns and not
  // one of them is in Kodagu.
  Siddapur: { lat: 12.29547, lon: 75.87485 },
  // Queried as "Ammatti". "Ammathi" returns nothing at all from this vendor.
  Ammathi: { lat: 12.23896, lon: 75.85806 },
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

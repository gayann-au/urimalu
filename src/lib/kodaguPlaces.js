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

// Approximate town centres. The first seventeen pairs below, Virajpet down to
// Ammathi, were taken from the Open-Meteo geocoding API, the same vendor as the
// forecast endpoint the weather card calls, so those coordinates and the
// forecast come from one source:
//
//   https://geocoding-api.open-meteo.com/v1/search?name=Madikeri&count=10&country=IN
//
// NOT ONE OF THESE NUMBERS WAS TYPED FROM MEMORY. Each name was queried on its
// own and the results kept only when admin2 was the district, spelled "Coorg"
// in that dataset, or when the point fell inside the Kodagu bounding box of
// 11.9 to 12.9 north and 75.4 to 76.3 east. All seventeen cleared the admin2
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
// The first seven were resolved on 2 August 2026 and the next ten on 4 August
// 2026. The seven were re-queried on the second date and came back identical,
// so those seventeen are one consistent read of the vendor rather than two.
//
// The four added on 8 August 2026 are a different case. Three of them are not
// in the vendor's dataset at all and came from elsewhere, so everything above
// this line describes the first seventeen only. Their sources are recorded in
// the block directly above them in the table.
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
  // Added 8 August 2026, and NOT ALL FROM ONE VENDOR, unlike the seventeen
  // above. Open-Meteo has a pair for Birunani and has nothing for the other
  // three, so those three were sourced elsewhere and each one says where.
  //
  //   Birunani       Open-Meteo, admin2 returned as Coorg. Same source and the
  //                  same admin2 test as every entry above it.
  //   T. Shettigeri  Open-Meteo returned nothing under that name or under
  //                  "Shettigeri". Taken instead from a Central Ground Water
  //                  Board record for T.Shettigeri, Virajpet, which publishes
  //                  full decimal precision.
  //   Murnad         Open-Meteo returned nothing under Murnad, Murnadu or
  //                  Moornad. Taken from OpenStreetMap, and THE PIN IS A
  //                  LANDMARK RATHER THAN THE VILLAGE CENTRE: it is MURNAD JUMA
  //                  MASJID on Mangaluru Road in Murnadu, Madikeri taluk. Kept
  //                  because rain and temperature do not vary over a few
  //                  hundred metres, but a later reader should know the point
  //                  is a landmark and not mistake it for a centre.
  //   Badagarakeri   Open-Meteo returned nothing. Taken from OpenStreetMap,
  //                  which names it Badagarakeri, Ponnampete taluk, Kodagu.
  //
  // All four were checked against the Kodagu bounding box of 11.9 to 12.9 north
  // and 75.4 to 76.3 east and all four fall inside it. Each also names a Kodagu
  // taluk in the record it came from: Virajpet for T. Shettigeri, Madikeri for
  // Murnad, Ponnampete for Badagarakeri. Birunani names the district rather
  // than a taluk, being the vendor's own admin2 of Coorg, which is the same
  // test the seventeen above cleared.
  Birunani: { lat: 12.02849, lon: 75.86455 },
  // THE DOT IS GONE FROM THE KEY ON PURPOSE, and only from the key. This name
  // is also the suffix of an i18next lookup, weather.town.<key>, and i18next
  // reads a dot as a key separator by default, so "T. Shettigeri" would be
  // parsed as a path through nested objects and would never resolve however the
  // language files were written. The dot survives where it belongs, in the
  // displayed name, which lives in the weather.town value in en.json and
  // kn.json and reads "T. Shettigeri" on screen.
  //
  // Still quoted, for the space rather than the dot. Lookup is otherwise
  // unaffected: the key is lowercased into PLACES_BY_LOWER_NAME like every
  // other, and users.town is trimmed and lowercased before it is matched.
  "T Shettigeri": { lat: 12.025709, lon: 75.995725 },
  Murnad: { lat: 12.3162044, lon: 75.7528859 },
  Badagarakeri: { lat: 12.0426655, lon: 75.9036642 },
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

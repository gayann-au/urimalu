import { useQuery } from "@tanstack/react-query";
import { qk } from "../../lib/queryClient";
import { KODAGU_PLACES } from "../../lib/kodaguPlaces";

// Current conditions and three day rain for every Kodagu town we have a
// verified coordinate for, in one request.
//
// Free and keyless, so there is no secret here and nothing to rotate. It is
// also not our data: it is Open-Meteo's, and the card that renders it says so.
//
// ONE REQUEST, NOT SEVENTEEN. Verified against the live endpoint on 3 August
// 2026 at five towns and again on 4 August 2026 at all seventeen, because the
// multi-location form is the part of the vendor's API that is easiest to assume
// and easiest to get wrong:
//
//   curl "https://api.open-meteo.com/v1/forecast?latitude=<17 comma separated>
//         &longitude=<17 comma separated>&current=temperature_2m,
//         relative_humidity_2m,weather_code&daily=precipitation_sum
//         &past_days=3&forecast_days=3&timezone=Asia/Kolkata"
//
// It returned a JSON array of seventeen objects in request order, each with six
// daily.time entries, from a URL 613 characters long. So there is no split
// request path and no parallel per town fallback in this file: the single
// request works, and a fallback for a path that does not fail is untested code
// standing in a hot path. If the vendor ever changes the shape, assertShape
// below throws and the section shows its error state rather than quietly
// mislabelling a town.
//
// The objects from index 1 onward carry location_id equal to their index, and
// index 0 carries none. That is the vendor's own numbering, checked below where
// it is present, but the mapping is by array position because position is what
// the vendor documents.

// The towns, in the order the section renders them. Coordinates come from the
// committed KODAGU_PLACES table so there is one set of numbers in the client,
// not a second copy drifting from the first.
//
// The five this section shipped with keep their order relative to each other,
// and everything resolved after them still follows in the order it resolved.
// They are no longer the first five on screen: the four added on 8 August 2026
// sit directly after Madikeri, which puts Virajpet sixth.
//
// TWENTY-ONE, AND NOT HELD TO A NUMBER. The towns still missing are missing
// because no source was found for them, not because the list was capped.
// Talacauvery, Shanivarsanthe, Chettalli and Balele return nothing from the
// geocoding API under any spelling tried and nothing has been found for them
// elsewhere either, so they stay absent rather than approximated. Murnad was in
// that group until 8 August 2026, when OpenStreetMap supplied a point for it.
//
// Three of the four added that day are not in Open-Meteo's dataset at all, so
// this list no longer rests on one vendor. Each of the four records its own
// source in KODAGU_PLACES in src/lib/kodaguPlaces.js, including the one whose
// pin is a landmark rather than a village centre. Read that block before adding
// a name here: a coordinate typed from memory would put one valley's rainfall
// under another valley's name, and nothing on screen would look wrong.
export const WEATHER_TOWNS = [
  "Madikeri",
  "Birunani",
  "T. Shettigeri",
  "Murnad",
  "Badagarakeri",
  "Virajpet",
  "Kushalnagar",
  "Somwarpet",
  "Gonikoppal",
  "Ponnampet",
  "Suntikoppa",
  "Napoklu",
  "Bhagamandala",
  "Srimangala",
  "Kutta",
  "Kodlipet",
  "Titimati",
  "Kakkabe",
  "Hudikeri",
  "Siddapur",
  "Ammathi",
];

// Open-Meteo refreshes roughly every fifteen minutes and this is a hills app on
// a weak connection, so the 30 second global default would be pure waste. Same
// reasoning as MARKET_STALE_TIME_MS in useMarketSnapshots.js.
const WEATHER_STALE_TIME_MS = 15 * 60_000;

// past_days=3 returns the three days before today and forecast_days=3 returns
// today plus the two after it, so daily.time is six entries long and splits at
// index 3. "Last 3 days" is therefore 0 to 2, the three completed days, and
// "next 3 days" is 3 to 5, today included. Verified against the live response,
// whose daily.time on 3 August 2026 read:
//   2026-07-31, 2026-08-01, 2026-08-02, 2026-08-03, 2026-08-04, 2026-08-05
const PAST_WINDOW = [0, 3];
const NEXT_WINDOW = [3, 6];
const EXPECTED_DAILY_COUNT = 6;

// Index 3 is today, the first of the three forecast days. Sunshine and rain
// chance are read for today only rather than summed across a window: hours of
// sun added up over three days is not a figure anyone can picture, and the
// highest chance of rain across three days would quietly become a claim about
// a day the reader did not ask about.
const TODAY_INDEX = 3;

function buildUrl() {
  const coords = WEATHER_TOWNS.map((name) => KODAGU_PLACES[name]);
  const params = new URLSearchParams({
    latitude: coords.map((c) => c.lat).join(","),
    longitude: coords.map((c) => c.lon).join(","),
    current: "temperature_2m,relative_humidity_2m,weather_code",
    daily: "precipitation_sum,sunshine_duration,precipitation_probability_max",
    past_days: "3",
    forecast_days: "3",
    timezone: "Asia/Kolkata",
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

// Sum a half open window of daily.precipitation_sum, or null when the window
// is not wholly present.
//
// A partial sum is the dangerous answer here. Two days of rain reported as a
// three day total reads as a drier week than it was, and nothing on screen
// would say a day was missing. Refusing the whole figure is the honest failure,
// and the card drops that one line rather than the town.
function sumWindow(values, [start, end]) {
  if (!Array.isArray(values)) return null;
  let total = 0;
  for (let i = start; i < end; i++) {
    const value = values[i];
    if (value == null || value === "" || isNaN(Number(value))) return null;
    total += Number(value);
  }
  // Floating point addition of 35.4 + 35.6 + 22.5 lands on 93.50000000000001.
  // Rounded to two decimals here so the value carried forward is the one the
  // source published, not its binary residue; the display formatter takes one.
  return Math.round(total * 100) / 100;
}

// Throws unless the payload has exactly one entry per requested town. Mapping
// by index onto the wrong length would print one town's weather under another
// town's name, which is the exact failure kodaguPlaces.js warns about: never
// show numbers under a name they are not for.
//
// The check is against WEATHER_TOWNS.length rather than a written-in number, so
// adding a town to the list above cannot leave this guard behind.
function assertShape(payload) {
  const list = Array.isArray(payload) ? payload : [payload];
  if (list.length !== WEATHER_TOWNS.length) {
    throw new Error(
      `Open-Meteo returned ${list.length} locations, expected ${WEATHER_TOWNS.length}`
    );
  }
  list.forEach((entry, index) => {
    // Present from index 1 onward in the observed response. Checked only where
    // the vendor sends it, never required, so the vendor adding it to index 0
    // later would not break this.
    if (entry?.location_id != null && Number(entry.location_id) !== index) {
      throw new Error(
        `Open-Meteo location_id ${entry.location_id} at position ${index}`
      );
    }
  });
  return list;
}

// A hung request is worse here than a failed one. fetch has no timeout of its
// own, so a connection that opens and then stalls, which is an ordinary
// afternoon on a hill network, leaves the query pending forever and the
// section showing its loading state with no end. Twelve seconds turns that
// into an error the section can put into words.
const WEATHER_TIMEOUT_MS = 12_000;

async function fetchKodaguWeather() {
  const res = await fetch(buildUrl(), {
    signal: AbortSignal.timeout(WEATHER_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Open-Meteo responded ${res.status}`);
  }
  const payload = await res.json();

  // WHEN THE VENDOR ANSWERED, not when a component rendered.
  //
  // This is the whole reason the hook returns an object rather than the array
  // it used to. The section prints this back to the reader as "Last checked",
  // the same sentence every price card carries, and that sentence has to name
  // the moment the reading actually arrived. Taken in the queryFn, so it is
  // stamped once per real network round trip and then held by react-query for
  // the life of the cache entry: a re-render does not move it, and neither does
  // a component mounting an hour later against a cached response. An hour old
  // reading then says so, which is the point.
  //
  // Read after res.json() resolves, so a large body that takes time to parse is
  // counted as part of the fetch rather than excluded from it.
  //
  // Nothing is stored. This lives in the query cache alongside the readings and
  // dies with them; no past value is written anywhere.
  const fetchedAt = Date.now();

  const list = assertShape(payload);

  const readings = list.map((entry, index) => {
    const daily = entry?.daily ?? {};
    // A daily block of the wrong length makes both windows meaningless, so
    // both are dropped together rather than one being summed off the end.
    const hasDaily =
      Array.isArray(daily.time) && daily.time.length === EXPECTED_DAILY_COUNT;
    const sums = hasDaily ? daily.precipitation_sum : null;

    return {
      name: WEATHER_TOWNS[index],
      temperatureC: entry?.current?.temperature_2m ?? null,
      humidity: entry?.current?.relative_humidity_2m ?? null,
      weatherCode: entry?.current?.weather_code ?? null,
      rainPast3Mm: sumWindow(sums, PAST_WINDOW),
      rainNext3Mm: sumWindow(sums, NEXT_WINDOW),
      // Today's figures, read straight off the vendor's arrays. Null when the
      // daily block is the wrong length, same as the rain windows, so a card
      // drops the line rather than reading off the end of an array.
      sunshineTodayS: hasDaily ? daily.sunshine_duration?.[TODAY_INDEX] ?? null : null,
      rainChanceTodayPct: hasDaily
        ? daily.precipitation_probability_max?.[TODAY_INDEX] ?? null
        : null,
    };
  });

  return { readings, fetchedAt };
}

// No auth gate on this one. Unlike market_snapshots there is no RLS policy in
// play, but the section it feeds only mounts on the logged-in feed, so it does
// not fire for a visitor either.
//
// data is { readings, fetchedAt }, never a bare array. readings is one entry per
// WEATHER_TOWNS name in that order; fetchedAt is the epoch millisecond the
// vendor's response finished parsing. A caller must read data.readings.
export function useKodaguWeather() {
  return useQuery({
    queryKey: qk.kodaguWeather,
    queryFn: fetchKodaguWeather,
    staleTime: WEATHER_STALE_TIME_MS,
  });
}

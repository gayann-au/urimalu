import { useQuery } from "@tanstack/react-query";
import { qk } from "../../lib/queryClient";
import { KODAGU_PLACES } from "../../lib/kodaguPlaces";

// Current conditions and three day rain for five Kodagu towns, in one request.
//
// Free and keyless, so there is no secret here and nothing to rotate. It is
// also not our data: it is Open-Meteo's, and the card that renders it says so.
//
// ONE REQUEST, NOT FIVE. Verified against the live endpoint on 3 August 2026
// before this file was written, because the multi-location form is the part of
// the vendor's API that is easiest to assume and easiest to get wrong:
//
//   curl "https://api.open-meteo.com/v1/forecast?latitude=<5 comma separated>
//         &longitude=<5 comma separated>&current=temperature_2m,
//         relative_humidity_2m,weather_code&daily=precipitation_sum
//         &past_days=3&forecast_days=3&timezone=Asia/Kolkata"
//
// It returned a JSON array of five objects in request order, each with six
// daily.time entries. So there is no parallel five request fallback in this
// file: the single request works, and a fallback for a path that does not fail
// is untested code standing in a hot path. If the vendor ever changes the
// shape, assertShape below throws and the section shows its error state rather
// than quietly mislabelling a town.
//
// The objects from index 1 onward carry location_id equal to their index, and
// index 0 carries none. That is the vendor's own numbering, checked below where
// it is present, but the mapping is by array position because position is what
// the vendor documents.

// The five towns, in the order the section renders them. Coordinates come from
// the committed KODAGU_PLACES table so there is one set of numbers in the
// client, not a second copy drifting from the first.
//
// This list is deliberately shorter than KODAGU_PLACES. Ponnampet and
// Suntikoppa have coordinates there for the town lookup and are not shown here,
// because five cards is what fits a phone's scroll without becoming a list
// nobody reaches the end of.
export const WEATHER_TOWNS = [
  "Madikeri",
  "Virajpet",
  "Kushalnagar",
  "Somwarpet",
  "Gonikoppal",
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

// Throws unless the payload is the five-entry array this file was written
// against. Mapping by index onto the wrong length would print one town's
// weather under another town's name, which is the exact failure kodaguPlaces.js
// warns about: never show numbers under a name they are not for.
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

async function fetchKodaguWeather() {
  const res = await fetch(buildUrl());
  if (!res.ok) {
    throw new Error(`Open-Meteo responded ${res.status}`);
  }
  const list = assertShape(await res.json());

  return list.map((entry, index) => {
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
}

// No auth gate on this one. Unlike market_snapshots there is no RLS policy in
// play, but the section it feeds only mounts on the logged-in feed, so it does
// not fire for a visitor either.
export function useKodaguWeather() {
  return useQuery({
    queryKey: qk.kodaguWeather,
    queryFn: fetchKodaguWeather,
    staleTime: WEATHER_STALE_TIME_MS,
  });
}

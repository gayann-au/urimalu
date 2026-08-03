import { useQuery } from "@tanstack/react-query";
import { qk } from "../../lib/queryClient";

// The US dollar to rupee rate. Free, keyless, and not from our database.
//
// The two coffee benchmarks beside this one are quoted in US money, so without
// a rate a reader has no way to place them against a rupee price they know.
// That is the whole reason this number is on the page.
//
// It is fetched rather than stored because market_snapshots has no row for it
// and putting one there would mean a schema change and a refresh job for a
// figure that costs one request. Verified against the live endpoint on
// 3 August 2026: result "success", rates.INR present, and a
// time_last_update_utc of "Sun, 02 Aug 2026 00:02:31 +0000".
const USD_INR_URL = "https://open.er-api.com/v6/latest/USD";

// The provider updates once a day, and its own time_next_update_utc in the
// observed response was roughly 24 hours out. An hour is short enough that a
// reader who leaves the app open overnight gets the new rate, and long enough
// that this is one request a session on a hill connection.
const FX_STALE_TIME_MS = 60 * 60_000;

// Millisecond timestamp from the provider's epoch seconds, or null.
// time_last_update_unix is a real instant, so it is parsed as one, unlike
// source_date on a market row which is a date column and must not be.
function toMillis(unixSeconds) {
  if (unixSeconds == null || isNaN(Number(unixSeconds))) return null;
  const ms = Number(unixSeconds) * 1000;
  return Number.isFinite(ms) ? ms : null;
}

async function fetchUsdInr() {
  const res = await fetch(USD_INR_URL);
  if (!res.ok) throw new Error(`open.er-api.com responded ${res.status}`);

  const json = await res.json();
  // The provider answers 200 with result "error" on a bad request, so the
  // status code alone does not mean there is a rate in here.
  if (json?.result !== "success") {
    throw new Error(`open.er-api.com result ${json?.result}`);
  }

  const rate = json?.rates?.INR;
  if (rate == null || isNaN(Number(rate))) {
    throw new Error("open.er-api.com returned no INR rate");
  }

  return {
    rate: Number(rate),
    // The provider's own stamp, kept verbatim as a string. It is rendered as
    // published rather than reformatted, because it is the source's statement
    // about when it last looked, not ours.
    updatedUtc: json?.time_last_update_utc ?? null,
    updatedMs: toMillis(json?.time_last_update_unix),
  };
}

export function useUsdInr() {
  return useQuery({
    queryKey: qk.usdInr,
    queryFn: fetchUsdInr,
    staleTime: FX_STALE_TIME_MS,
  });
}

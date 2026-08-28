import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

// The one read behind the admin metrics page.
//
// Everything this page shows is computed inside the metrics Edge Function and
// arrives already aggregated. There is no second query anywhere on that page,
// and there must not be: push_subscriptions, notifications, crop_follows and
// seller_leads are own-rows-only under RLS, so an admin reading them from the
// browser gets zero rows and no error, and assistant_logs is sealed outright.
// A client-side count of any of them would put a confident zero on screen for
// data that is working fine. The function exists precisely to avoid that.

export const qkMetrics = ["admin", "metrics"];

// How the function's refusals read to a person.
//
// The function answers 401, 403 and 503 with a one word code and no prose,
// because it should not be composing English for a screen it cannot see. The
// English lives here.
const ERROR_TEXT = {
  unauthorized: "You are not signed in, or the session has expired.",
  forbidden: "This page is for admin accounts only.",
  unavailable: "The metrics service could not reach the database.",
};

// Pull the code out of a non-2xx response.
//
// functions.invoke does not put an error response body into data. It hands back
// a FunctionsHttpError carrying the raw Response on .context, and the body is
// still unread at that point. Reading it is what turns "Edge Function returned
// a non-2xx status code", which tells an admin nothing, into a sentence naming
// what actually happened.
async function describeInvokeError(error) {
  try {
    const body = await error?.context?.json?.();
    const code = body?.error;
    if (code && ERROR_TEXT[code]) return ERROR_TEXT[code];
    if (code) return `The metrics service refused the request (${code}).`;
  } catch {
    // No JSON body, or the body was already consumed. Fall through to the
    // transport level message below, which is all that is left to say.
  }
  return error?.message || "The metrics request failed.";
}

async function fetchMetrics() {
  if (!supabase) throw new Error("The database client is not configured.");

  const { data, error } = await supabase.functions.invoke("metrics");

  if (error) throw new Error(await describeInvokeError(error));

  // A 200 carrying an error field should not exist, but treating it as success
  // would render a page of blanks with no explanation, so it is caught here.
  if (data?.error) throw new Error(ERROR_TEXT[data.error] || String(data.error));
  if (!data) throw new Error("The metrics service returned nothing.");

  return data;
}

// staleTime of a minute, because these are counts of a slow moving app read by
// one person, and every call is a fan of exact counts across six tables. Retry
// is off: the two most likely failures are "not an admin" and "session expired",
// and repeating either is a wasted round trip that only delays the message
// telling the admin what is wrong.
export function useMetrics() {
  return useQuery({
    queryKey: qkMetrics,
    queryFn: fetchMetrics,
    staleTime: 60_000,
    retry: false,
  });
}

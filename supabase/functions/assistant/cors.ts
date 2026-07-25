// Shared CORS headers for the assistant function.
//
// Unlike send-push (which is triggered server side by a database webhook and
// needs no CORS), this function is called directly from the browser via
// supabase.functions.invoke(), so it must answer the OPTIONS preflight and
// echo the headers the Supabase client sends (authorization + apikey).

export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Build a JSON Response that always carries the CORS headers. Every exit path
// in index.ts goes through here so a browser caller never trips on a missing
// Access-Control-Allow-Origin.
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "content-type": "application/json" },
  });
}

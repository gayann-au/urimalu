import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Build the client defensively. createClient throws synchronously when the URL
// is missing or malformed, and because this module is imported during app
// bootstrap that throw would take the whole app down to a blank white screen.
// We validate first and swallow any failure here so the bootstrap in main.jsx
// can detect bad config and show a friendly message instead of crashing.
function createSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    // eslint-disable-next-line no-console
    console.error("Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env");
    return null;
  }

  try {
    // Throws for a malformed URL, the other way bad config crashes the import.
    new URL(supabaseUrl);
  } catch {
    // eslint-disable-next-line no-console
    console.error("VITE_SUPABASE_URL is not a valid URL");
    return null;
  }

  try {
    return createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("Failed to initialise the Supabase client", err);
    return null;
  }
}

// supabase is the live client, or null when the environment is not configured.
// isSupabaseConfigured lets the bootstrap gate rendering on a valid client.
export const supabase = createSupabaseClient();
export const isSupabaseConfigured = supabase !== null;
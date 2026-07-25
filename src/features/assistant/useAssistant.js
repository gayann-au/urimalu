import { useMutation } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/useAuth";

// Data layer for the assistant. This is the first place in the app that talks
// to a Supabase Edge Function from the browser (send-push is webhook-driven),
// so it establishes the supabase.functions.invoke pattern.
//
// The client stays deliberately thin: it posts { message, role } and returns
// the reply. All the real logic (small-talk shortcut, rule-based guardrails,
// crop/market extraction, the read-only listings lookup, and the single Groq
// call) lives server-side in supabase/functions/assistant, so no API key or
// prompt ever ships to the browser.
export function useAssistant() {
  const { role } = useAuth();
  return useMutation({
    mutationFn: async (message) => {
      const text = String(message || "").trim();
      if (!text) throw new Error("empty message");
      // The widget is only mounted for farmers and merchants; fall back to
      // FARMER phrasing if the role is somehow missing so the Edge Function
      // still receives a valid role.
      const effectiveRole = role === "MERCHANT" ? "MERCHANT" : "FARMER";
      const { data, error } = await supabase.functions.invoke("assistant", {
        body: { message: text, role: effectiveRole },
      });
      if (error) throw error;
      if (!data || typeof data.reply !== "string") throw new Error("bad response");
      return data; // { reply, source }
    },
  });
}

import { useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../features/auth/useAuth";

export function useLeadTracking() {
  const { user, profile } = useAuth();
  const trackLead = useCallback(async (merchantId, type, crop = null) => {
    if (!user || !profile) return; // never track for guests
    try {
      await supabase.from("leads").insert({
        merchant_id: merchantId,
        farmer_id: profile.id,
        type,
        crop,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[trackLead] failed", e);
    }
  }, [user, profile]);

  // VIEW tracking: debounce per merchant per session
  const trackView = useCallback((merchantId) => {
    if (!user) return;
    const key = `coorgrate.view.${profile?.id || "?"}.${merchantId}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {}
    trackLead(merchantId, "VIEW");
  }, [user, profile, trackLead]);

  return { trackLead, trackView };
}
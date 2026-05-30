import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

async function fetchAllLeads() {
  const { data, error } = await supabase.from("leads").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}
export function useAllLeads() { return useQuery({ queryKey: qk.leads, queryFn: fetchAllLeads }); }

async function tryUpdate(id, patch) {
  return await supabase.from("users").update(patch).eq("id", id).select();
}

export function useSetMerchantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, status, reason }) => {
      if (status === "REJECTED") {
        if (!reason || !reason.trim()) throw new Error("admin.rejectReasonRequired");
      }

      let pendingRate = null;
      if (status === "APPROVED") {
        const { data: row, error: readErr } = await supabase.from("users")
          .select("pending_rate").eq("id", userId).maybeSingle();
        if (readErr) throw new Error(readErr.message);
        pendingRate = row?.pending_rate || null;
      }

      const patch = { status, updated_at: new Date().toISOString() };
      if (status === "REJECTED") patch.rejection_reason = reason.trim();
      if (status === "APPROVED") { patch.rejection_reason = null; patch.pending_rate = null; }

      let res = await tryUpdate(userId, patch);
      if (res.error && /updated_at/.test(res.error.message || "")) {
        const { updated_at, ...noUpdated } = patch;
        res = await tryUpdate(userId, noUpdated);
      }
      if (res.error) throw new Error(res.error.message || "Update failed");
      if (!res.data || res.data.length === 0) throw new Error("admin.rlsBlocked");

      if (status === "APPROVED" && pendingRate && hasAnyPrice(pendingRate)) {
        const { error: insErr } = await supabase.from("rates")
          .insert({ ...pendingRate, merchant_id: userId, active: true });
        if (insErr) {
          // eslint-disable-next-line no-console
          console.error("[useSetMerchantStatus] pending_rate -> rates insert failed", insErr.message);
        }
      }
      return res.data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.rates });
    },
  });
}

function hasAnyPrice(r) {
  return [
    r.rc_ep_price, r.rc_spot_lift_price, r.rc_delivery_price, r.rc_old_ep_price,
    r.ot_price, r.ac_price, r.ap_price, r.rp_price, r.pepper_price, r.cardamom_price,
  ].some(x => x != null) || r.ac_call_for_price || r.pepper_call_for_price;
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabase.from("users").delete().eq("id", id).select();
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("admin.rlsBlocked");
      return data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.rates });
      qc.invalidateQueries({ queryKey: qk.reviews });
      qc.invalidateQueries({ queryKey: qk.leads });
    },
  });
}

export function useRemoveRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("rates").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rates }),
  });
}

export function useRemoveReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reviews }),
  });
}
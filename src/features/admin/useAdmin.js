import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

// RETURNING "id" instead of a bare .select(): the rows are only counted to
// detect RLS-blocked writes, and RETURNING * is refused under the users
// column grants (no SELECT on every column for authenticated).
async function tryUpdate(id, patch) {
  return await supabase.from("users").update(patch).eq("id", id).select("id");
}

// Approve, reject, or otherwise set a merchant's status.
// Approval just flips status to APPROVED and stamps approved_at.
// It does NOT create any listing. Merchants add their own listings after approval.
export function useSetMerchantStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, status, reason }) => {
      if (status === "REJECTED") {
        if (!reason || !reason.trim()) throw new Error("admin.rejectReasonRequired");
      }

      const now = new Date().toISOString();
      const patch = { status, updated_at: now };
      if (status === "REJECTED") patch.rejection_reason = reason.trim();
      if (status === "APPROVED") {
        patch.rejection_reason = null;
        patch.approved_at = now;
      }

      let res = await tryUpdate(userId, patch);
      if (res.error && /updated_at/.test(res.error.message || "")) {
        const { updated_at, ...noUpdated } = patch;
        res = await tryUpdate(userId, noUpdated);
      }
      if (res.error) throw new Error(res.error.message || "Update failed");
      if (!res.data || res.data.length === 0) throw new Error("admin.rlsBlocked");

      return res.data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
    },
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { data, error } = await supabase.from("users").delete().eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("admin.rlsBlocked");
      return data[0];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.users });
      qc.invalidateQueries({ queryKey: qk.listings });
      qc.invalidateQueries({ queryKey: qk.reviews });
      qc.invalidateQueries({ queryKey: qk.leads });
    },
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

// ============================================
// Admin crop price management
//
// Admins can view every merchant's listings and correct or remove any of them
// (a clear pricing error, spam, etc.). Writes go to the same listings table the
// merchants use; the existing listings_admin_all RLS policy already permits an
// admin to update or delete any row, so no new policy is needed here.
// ============================================

// Every listing across all merchants, active and inactive. The merchant name is
// joined in the component from the existing users query, matching how the feed
// resolves merchant details, so this stays a plain single-table read.
export function useAllListings() {
  return useQuery({
    queryKey: qk.listingsAdminAll,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .order("crop_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

// Plain update of one listing row by id. Deliberately does NOT append to
// price_history: an admin correction is a fix, not a merchant confirming a new
// price, and the price_history insert policy is merchant-scoped anyway.
// price_per_kg is a generated column, so the feed recomputes it from the new
// price automatically. Every listings cache (feed, profile, dashboard, admin)
// is invalidated through the shared "listings" key prefix.
export function useAdminUpdateListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }) => {
      const { data, error } = await supabase
        .from("listings")
        .update({ ...fields, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listings"] }),
  });
}

// Delete one listing row by id. Cascades remove its price_history rows.
export function useAdminDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("listings").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listings"] }),
  });
}

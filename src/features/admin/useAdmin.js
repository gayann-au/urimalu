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

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

const qkReports = ["reports", "all"];

async function fetchOpenReports() {
  const { data, error } = await supabase
    .from("reports")
    .select("id, created_at, merchant_id, reported_by, reason, status, merchant:users!reports_merchant_id_fkey(id, business_name)")
    .eq("status", "OPEN")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

export function useReports() {
  return useQuery({ queryKey: qkReports, queryFn: fetchOpenReports });
}

export function useSubmitReport() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ merchantId, reason }) => {
      if (!profile) throw new Error("report.loginRequired");
      const { data, error } = await supabase
        .from("reports")
        .insert({ merchant_id: merchantId, reported_by: profile.id, reason })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qkReports }),
  });
}

export function useUpdateReportStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { data, error } = await supabase
        .from("reports")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qkReports }),
  });
}

// RETURNING "id" instead of a bare .select(): the rows are only counted to
// detect RLS-blocked writes, and RETURNING * is refused under the users
// column grants (no SELECT on every column for authenticated).
async function tryUpdate(id, patch) {
  return await supabase.from("users").update(patch).eq("id", id).select("id");
}

export function useToggleMerchantDisabled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, isDisabled }) => {
      const patch = { is_disabled: isDisabled, updated_at: new Date().toISOString() };
      let res = await tryUpdate(userId, patch);
      if (res.error && /updated_at/.test(res.error.message || "")) {
        res = await tryUpdate(userId, { is_disabled: isDisabled });
      }
      if (res.error) throw new Error(res.error.message || "Update failed");
      if (!res.data || res.data.length === 0) throw new Error("admin.rlsBlocked");
      return res.data[0];
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.users }),
  });
}

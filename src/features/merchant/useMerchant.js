import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

export function usePostRate(merchantId) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (row) => {
      const payload = { ...row, merchant_id: merchantId, active: true };
      const { data, error } = await supabase.from("rates").insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.rates });
    },
  });
}

export function useDeleteRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rateId) => {
      const { error } = await supabase.from("rates").delete().eq("id", rateId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.rates }),
  });
}
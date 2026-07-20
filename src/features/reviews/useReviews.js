import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

export function useAddReview() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ merchantId, rating, comment, authorName }) => {
      if (!profile) throw new Error("Login required");
      const { data, error } = await supabase.from("reviews").insert({
        merchant_id: merchantId,
        farmer_id: profile.id,
        author_name: authorName?.trim() || profile.full_name?.trim() || "Farmer",
        rating,
        comment: comment || null,
      }).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reviews }),
  });
}

export function useDeleteReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id) => {
      const { error } = await supabase.from("reviews").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.reviews }),
  });
}
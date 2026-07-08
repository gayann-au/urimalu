import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

// Data layer for crop_follows (price alerts). A follow row belongs to exactly
// one user; RLS restricts every read and write to the owner, and these hooks
// mirror that by always scoping on the signed-in profile id.

// The signed-in user's follows. Consumers index by crop_name to decide whether
// a given crop card shows the followed or not-followed state.
export function useMyCropFollows() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: qk.cropFollows(profile?.id),
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("crop_follows")
        .select("*")
        .eq("user_id", profile.id);
      if (error) throw error;
      return data || [];
    },
  });
}

// Follow a crop, or change the alert settings of an existing follow. Upsert on
// the (user_id, crop_name) unique key so following twice just updates the
// settings. threshold_value is rupees per kg and must be null for any_change,
// which the caller guarantees and a table CHECK enforces.
export function useFollowCrop() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ cropName, alertType, thresholdValue }) => {
      if (!profile) throw new Error("alerts.loginRequired");
      const row = {
        user_id: profile.id,
        crop_name: cropName,
        alert_type: alertType,
        threshold_value: alertType === "threshold" ? thresholdValue : null,
      };
      const { data, error } = await supabase
        .from("crop_follows")
        .upsert(row, { onConflict: "user_id,crop_name" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      if (profile) qc.invalidateQueries({ queryKey: qk.cropFollows(profile.id) });
    },
  });
}

// Stop alerts for a crop.
export function useUnfollowCrop() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async (cropName) => {
      if (!profile) throw new Error("alerts.loginRequired");
      const { error } = await supabase
        .from("crop_follows")
        .delete()
        .eq("user_id", profile.id)
        .eq("crop_name", cropName);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      if (profile) qc.invalidateQueries({ queryKey: qk.cropFollows(profile.id) });
    },
  });
}

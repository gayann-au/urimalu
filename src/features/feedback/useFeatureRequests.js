import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "../auth/useAuth";

// Data layer for feature_requests. RLS is the real boundary: a user may only
// insert rows for themselves and read their own rows, while an admin may read
// every row and update status. The client mirrors those rules but never relies
// on them alone.

// Submit a new feature request. user_id and role come from the signed-in
// profile, never from the form, and status is left to the table default (NEW).
export function useSubmitFeatureRequest() {
  const qc = useQueryClient();
  const { profile } = useAuth();
  return useMutation({
    mutationFn: async ({ category, title, description }) => {
      if (!profile) throw new Error("feature.loginRequired");
      // Persist the submitter's display name on the row itself so it survives
      // even if the account is later deleted. Merchants are known by their
      // business name, farmers by their full name.
      const submitterName =
        (profile.role === "MERCHANT" ? profile.business_name : profile.full_name) || "";
      const { data, error } = await supabase
        .from("feature_requests")
        .insert({
          user_id: profile.id,
          role: profile.role,
          submitter_name: submitterName,
          category,
          title: title.trim(),
          description: description.trim(),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      if (profile) qc.invalidateQueries({ queryKey: qk.featureRequestsMine(profile.id) });
    },
  });
}

// The signed-in user's own past requests, newest first. The explicit user_id
// filter keeps the read scoped even for an admin, and RLS enforces it server
// side regardless.
export function useMyFeatureRequests() {
  const { profile } = useAuth();
  return useQuery({
    queryKey: qk.featureRequestsMine(profile?.id),
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_requests")
        .select("*")
        .eq("user_id", profile.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

// Every feature request, newest first. Only admins get rows back, enforced by
// the feature_requests_admin_read_all RLS policy.
export function useAllFeatureRequests() {
  return useQuery({
    queryKey: qk.featureRequests,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("feature_requests")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

// Admin-only status change. The feature_requests_admin_update RLS policy is the
// real gate: only is_admin() may update a row.
export function useUpdateFeatureRequestStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }) => {
      const { data, error } = await supabase
        .from("feature_requests")
        .update({ status })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.featureRequests }),
  });
}

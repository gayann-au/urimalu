import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { USER_COLUMNS_AUTHED } from "../../lib/constants";

// Self-service profile update for the logged-in user. This reuses the exact
// pattern the merchant resubmit flow uses in SignupMerchant: a plain self-update
// through the users_self_update_safe_fields RLS policy, which permits changing
// profile fields but never role, status, or is_disabled. RETURNING "id" detects
// an RLS-blocked update (zero rows back) the same way the resubmit flow does.
//
// The caller (the farmer or merchant account form) builds the patch with only
// the fields that role is allowed to edit, so this one mutation serves both.
export function useUpdateOwnProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, patch }) => {
      const { data, error } = await supabase
        .from("users").update(patch).eq("id", userId).select("id");
      if (error) throw new Error(error.message);
      if (!data || data.length === 0) throw new Error("account.rlsBlocked");

      // Read the saved row back with the authed column list so the cache holds
      // a complete profile (select("*") is refused by the column grants).
      const { data: row, error: readErr } = await supabase
        .from("users").select(USER_COLUMNS_AUTHED).eq("id", userId).maybeSingle();
      if (readErr) throw new Error(readErr.message);
      return row;
    },
    onSuccess: (row, { userId }) => {
      if (row) qc.setQueryData(qk.profile(userId), row);
      qc.invalidateQueries({ queryKey: qk.users });
    },
  });
}

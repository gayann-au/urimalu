import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { USER_COLUMNS_AUTHED, WELCOME_FLAG_KEY } from "../../lib/constants";
import { normalizePhone } from "../../lib/phone";

// Onboarding for brand new Google accounts. The Google session already exists
// (Supabase minted it from the verified id token) but there is no public.users
// row yet, because the sign-up trigger leaves OAuth accounts role-less. These
// mutations create that row server side, then fill the profile, leaving the
// user in exactly the same state as someone who signed up with email/password.
//
// This file is the Google-only counterpart to the password sign-up mutations
// in useAuth.js. The email/password flows there are left untouched.

// Own row read, mirroring useAuth.fetchProfile: select("*") on users is refused
// by the column grants, so the column list must be explicit.
async function fetchOwnProfile(userId) {
  const { data, error } = await supabase
    .from("users")
    .select(USER_COLUMNS_AUTHED)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw { code: "auth.onboardingError", raw: error.message };
  return data;
}

async function currentUserId() {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

// Creates the public.users row through the SECURITY DEFINER RPC (role and
// status are decided server side, never trusted from the client), then fills
// the remaining profile fields with a normal self-update. The self-update is
// allowed by users_self_update_safe_fields because it never touches
// role/status/is_disabled.
async function completeOnboarding(role, patch) {
  const userId = await currentUserId();
  if (!userId) throw { code: "auth.onboardingNoSession" };

  const { error: rpcError } = await supabase.rpc("complete_google_onboarding", { p_role: role });
  if (rpcError) throw { code: "auth.onboardingError", raw: rpcError.message };

  if (patch && Object.keys(patch).length > 0) {
    const { error: updError } = await supabase.from("users").update(patch).eq("id", userId);
    if (updError) throw { code: "auth.onboardingError", raw: updError.message };
  }

  const profile = await fetchOwnProfile(userId);
  return { userId, profile };
}

export function useFarmerOnboarding() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      completeOnboarding("FARMER", {
        full_name: data.fullName.trim(),
        phone: normalizePhone(data.phone, data.phoneCountry),
        district: data.district || null,
      }),
    onSuccess: ({ userId, profile }) => {
      if (profile) qc.setQueryData(qk.profile(userId), profile);
      // One-time flag: the feed shows a single welcome toast on the first
      // login after signup, then clears it.
      try { sessionStorage.setItem(WELCOME_FLAG_KEY, "1"); } catch {}
      // Farmers land on the feed, same as the password farmer sign-up.
      nav("/", { replace: true });
    },
  });
}

export function useMerchantOnboarding() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data) =>
      completeOnboarding("MERCHANT", {
        business_name: data.businessName.trim(),
        owner_name: data.ownerName.trim(),
        phone: normalizePhone(data.phone, data.phoneCountry),
        whatsapp: normalizePhone(data.whatsapp || data.phone, data.whatsappCountry || data.phoneCountry),
        town: data.town.trim(),
        district: data.district,
        years_trading: data.yearsTrading,
        business_type: data.businessType,
        crops_traded: data.cropsTraded,
        business_description: (data.businessDescription || "").slice(0, 200) || null,
      }),
    onSuccess: ({ userId, profile }) => {
      if (profile) qc.setQueryData(qk.profile(userId), profile);
      // Merchants land on the pending page for review, same as password sign-up.
      nav("/merchant/pending", { replace: true });
    },
  });
}

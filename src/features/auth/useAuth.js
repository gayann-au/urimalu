import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { USER_COLUMNS_AUTHED } from "../../lib/constants";

// Own row, so the authenticated column grant applies — select("*") is
// refused under the column grants from the users_select_lockdown migration.
// Throws on a failed request so a network or server error stays distinct from a
// genuine "no profile yet" result (data is null only when no row exists). The
// caller can then tell a fetch that simply failed apart from an account with no
// users row, instead of treating both the same and sending the user to
// onboarding.
async function fetchProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from("users").select(USER_COLUMNS_AUTHED).eq("id", userId).maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[useAuth.fetchProfile]", error);
    throw error;
  }
  return data;
}

export function useAuth() {
  const qc = useQueryClient();

  // 1) Session query (subscribes to onAuthStateChange)
  const sessionQuery = useQuery({
    queryKey: qk.session,
    queryFn: async () => {
      const { data, error } = await supabase.auth.getSession();
      if (error) throw error;
      return data.session;
    },
    staleTime: Infinity,
  });

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      qc.setQueryData(qk.session, session);
      if (!session) qc.removeQueries({ queryKey: ["users"], exact: false });
    });
    return () => sub.subscription.unsubscribe();
  }, [qc]);

  // 2) Profile query: runs only when session exists
  const userId = sessionQuery.data?.user?.id ?? null;
  const profileQuery = useQuery({
    queryKey: userId ? qk.profile(userId) : ["users", "none"],
    queryFn: () => fetchProfile(userId),
    enabled: !!userId,
    staleTime: 60_000,
  });

  const profile = profileQuery.data || null;
  const role = profile?.role || null;
  const effectiveStatus = profile?.role === "MERCHANT" ? profile.status : null;
  const isLoading = sessionQuery.isLoading || (!!userId && profileQuery.isLoading);
  // True only when a real session exists but its profile request failed. Kept
  // separate from "no profile" so the router can show a retry screen instead of
  // looping an existing user back through onboarding on a transient failure.
  const profileLoadError = !!userId && profileQuery.isError;

  return {
    user: sessionQuery.data?.user || null,
    session: sessionQuery.data || null,
    profile,
    role,
    effectiveStatus,
    isAuthenticated: !!sessionQuery.data,
    isLoading,
    profileLoadError,
    refetchProfile: profileQuery.refetch,
    refetchAuth: () => { sessionQuery.refetch(); if (userId) profileQuery.refetch(); },
  };
}

function mapAuthError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("email not confirmed")) return "auth.loginEmailNotConfirmed";
  if (m.includes("network") || m.includes("failed to fetch")) return "auth.loginNetwork";
  if (m.includes("user already registered") || m.includes("already")) return "auth.emailTaken";
  return "auth.loginError";
}

// Maps a Google sign-in failure to a friendly i18n code. The database-error
// branch is a fallback for the brief window before the google_onboarding
// migration is applied: until then the handle_new_user trigger still rejects a
// role-less Google sign-up. Once the migration is live a new Google email no
// longer errors here, it succeeds with no users row and is sent to onboarding.
function mapGoogleError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("network") || m.includes("failed to fetch")) return "auth.loginNetwork";
  if (m.includes("database error") || m.includes("saving new user")) return "auth.googleNoAccount";
  return "auth.googleError";
}

// Shared post-login redirect used by both password and Google sign-in: admins
// to the console, merchants to their dashboard or the pending screen, everyone
// else to the feed.
function navigateByProfile(nav, profile) {
  if (profile.role === "ADMIN") nav("/admin", { replace: true });
  else if (profile.role === "MERCHANT") {
    nav(profile.status === "APPROVED" ? "/merchant/dashboard" : "/merchant/pending", { replace: true });
  } else nav("/", { replace: true });
}

export function useLogin() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, password }) => {
      const e = email.toLowerCase().trim();
      const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
      // eslint-disable-next-line no-console
      console.log("[login] response", { user: !!data?.user, error });
      if (error) throw { code: mapAuthError(error), raw: error.message };
      if (!data?.user?.id) throw { code: "auth.loginError" };
      let profile = null;
      try {
        profile = await fetchProfile(data.user.id);
      } catch (err) {
        // The sign-in worked but the follow-up profile read failed. Show a
        // generic error rather than "row missing", which would wrongly imply
        // the account does not exist.
        throw { code: "auth.loginError", raw: err?.message };
      }
      if (!profile) throw { code: "auth.loginRowMissing" };
      qc.setQueryData(qk.session, data.session);
      qc.setQueryData(qk.profile(data.user.id), profile);
      return profile;
    },
    onSuccess: (profile) => navigateByProfile(nav, profile),
  });
}

export function useGoogleLogin() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (credential) => {
      if (!credential) throw { code: "auth.googleError" };
      // Supabase verifies the Google JWT server side and matches or creates the
      // auth.users row, then mints a session. This is the credential check the
      // task asks for, performed by Supabase instead of a separate backend.
      const { data, error } = await supabase.auth.signInWithIdToken({
        provider: "google",
        token: credential,
      });
      if (error) throw { code: mapGoogleError(error), raw: error.message };
      if (!data?.user?.id) throw { code: "auth.googleError" };
      qc.setQueryData(qk.session, data.session);
      let profile = null;
      try {
        profile = await fetchProfile(data.user.id);
      } catch (err) {
        // A failed profile read must not be mistaken for a brand new account,
        // which would wrongly push an existing user into onboarding. Surface
        // the error so the login screen shows it instead.
        throw { code: mapGoogleError(err), raw: err?.message };
      }
      // A first-time Google email has a session but no users row yet. Keep the
      // session and hand the visitor to onboarding to pick Farmer or Merchant,
      // instead of signing them out. Existing users have a row and go straight
      // to their normal landing spot.
      if (profile) qc.setQueryData(qk.profile(data.user.id), profile);
      return { profile };
    },
    onSuccess: ({ profile }) => {
      if (profile) navigateByProfile(nav, profile);
      else nav("/onboarding", { replace: true });
    },
  });
}

export function useSignupFarmer() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const e = data.email.toLowerCase().trim();
      // role travels in auth metadata so the handle_new_user trigger creates
      // the users row (id, email, role, status) on its own.
      const { data: auth, error } = await supabase.auth.signUp({
        email: e,
        password: data.password,
        options: { data: { role: "FARMER" } },
      });
      if (error) throw { code: mapAuthError(error), raw: error.message };
      const userId = auth?.user?.id;
      if (!userId) throw { code: "auth.loginError" };
      // Confirm-email is off, so a session normally exists here; keep the
      // sign-in fallback so the self-update below runs authenticated.
      if (!auth.session) await supabase.auth.signInWithPassword({ email: e, password: data.password });
      // The trigger already wrote id/email/role/status. Fill the remaining
      // profile fields via the self-update policy (role/status/is_disabled
      // are left untouched, so the policy allows it).
      const { error: updErr } = await supabase.from("users").update({
        full_name: data.fullName.trim(),
        phone: data.phone.trim(),
        district: data.district || null,
      }).eq("id", userId);
      if (updErr) throw { code: "auth.loginError", raw: updErr.message };
      let profile = null;
      try {
        profile = await fetchProfile(userId);
      } catch (err) {
        throw { code: "auth.loginError", raw: err?.message };
      }
      qc.setQueryData(qk.profile(userId), profile);
      return profile;
    },
    onSuccess: () => nav("/", { replace: true }),
  });
}

export function useSignupMerchant() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const e = data.email.toLowerCase().trim();
      // role travels in auth metadata so the handle_new_user trigger creates
      // the users row (id, email, role, status) on its own.
      const { data: auth, error } = await supabase.auth.signUp({
        email: e,
        password: data.password,
        options: { data: { role: "MERCHANT" } },
      });
      if (error) throw { code: mapAuthError(error), raw: error.message };
      const userId = auth?.user?.id;
      if (!userId) throw { code: "auth.loginError" };
      // Confirm-email is off, so a session normally exists here; keep the
      // sign-in fallback so the self-update below runs authenticated.
      if (!auth.session) await supabase.auth.signInWithPassword({ email: e, password: data.password });
      // The trigger already wrote id/email/role/status. Fill the remaining
      // profile fields via the self-update policy (role/status/is_disabled
      // are left untouched, so the policy allows it).
      const { error: updErr } = await supabase.from("users").update({
        business_name: data.businessName.trim(),
        owner_name: data.ownerName.trim(),
        phone: data.phone.trim(),
        whatsapp: (data.whatsapp || data.phone).trim(),
        town: data.town.trim(),
        district: data.district,
        years_trading: data.yearsTrading,
        business_type: data.businessType,
        crops_traded: data.cropsTraded,
        business_description: (data.businessDescription || "").slice(0, 200) || null,
      }).eq("id", userId);
      if (updErr) throw { code: "auth.loginError", raw: updErr.message };
      let profile = null;
      try {
        profile = await fetchProfile(userId);
      } catch (err) {
        throw { code: "auth.loginError", raw: err?.message };
      }
      qc.setQueryData(qk.profile(userId), profile);
      return profile;
    },
    onSuccess: () => nav("/merchant/pending", { replace: true }),
  });
}

export function useLogout() {
  const nav = useNavigate();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => { await supabase.auth.signOut(); },
    onSuccess: () => {
      qc.clear();
      nav("/", { replace: true });
    },
  });
}
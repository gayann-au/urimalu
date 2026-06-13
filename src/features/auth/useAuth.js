import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { USER_COLUMNS_AUTHED } from "../../lib/constants";

// Own row, so the authenticated column grant applies — select("*") is
// refused under the column grants from the users_select_lockdown migration.
async function fetchProfile(userId) {
  if (!userId) return null;
  const { data, error } = await supabase.from("users").select(USER_COLUMNS_AUTHED).eq("id", userId).maybeSingle();
  if (error) {
    // eslint-disable-next-line no-console
    console.error("[useAuth.fetchProfile]", error);
    return null;
  }
  return data;
}

export function useAuth() {
  const qc = useQueryClient();

  // 1) Session query (subscribes to onAuthStateChange)
  const sessionQuery = useQuery({
    queryKey: qk.session,
    queryFn: async () => {
      const { data } = await supabase.auth.getSession();
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

  return {
    user: sessionQuery.data?.user || null,
    session: sessionQuery.data || null,
    profile,
    role,
    effectiveStatus,
    isAuthenticated: !!sessionQuery.data,
    isLoading,
    refetchProfile: profileQuery.refetch,
  };
}

function mapAuthError(error) {
  const m = (error?.message || "").toLowerCase();
  if (m.includes("email not confirmed")) return "auth.loginEmailNotConfirmed";
  if (m.includes("network") || m.includes("failed to fetch")) return "auth.loginNetwork";
  if (m.includes("user already registered") || m.includes("already")) return "auth.emailTaken";
  return "auth.loginError";
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
      const profile = await fetchProfile(data.user.id);
      if (!profile) throw { code: "auth.loginRowMissing" };
      qc.setQueryData(qk.session, data.session);
      qc.setQueryData(qk.profile(data.user.id), profile);
      return profile;
    },
    onSuccess: (profile) => {
      if (profile.role === "ADMIN")    nav("/admin", { replace: true });
      else if (profile.role === "MERCHANT") {
        const status = profile.status;
        nav(status === "APPROVED" ? "/merchant/dashboard" : "/merchant/pending", { replace: true });
      } else nav("/", { replace: true });
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
      const profile = await fetchProfile(userId);
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
      const profile = await fetchProfile(userId);
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
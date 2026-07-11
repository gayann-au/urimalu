import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { Button } from "../../components/ui/Button";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { supabase } from "../../lib/supabase";
import { markManualSignOut } from "./useAuth";
import { useUriMotion } from "../../lib/uiMotion";

// Step two of password recovery, reached from the reset email link. The supabase
// client is created with detectSessionInUrl false, so we establish the recovery
// session by hand: implicit links carry access and refresh tokens in the URL
// hash, PKCE links carry a code query param. Once a session is in place the user
// can set a new password, after which we sign out so they log in fresh.
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const nav = useNavigate();
  const [phase, setPhase] = useState("checking"); // checking | ready | invalid | done
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    async function establish() {
      try {
        const hash = window.location.hash ? window.location.hash.replace(/^#/, "") : "";
        const hp = new URLSearchParams(hash);
        const qp = new URLSearchParams(window.location.search);

        if (hp.get("error") || qp.get("error")) {
          if (active) setPhase("invalid");
          return;
        }

        const accessToken = hp.get("access_token");
        const refreshToken = hp.get("refresh_token");
        const code = qp.get("code");

        if (accessToken && refreshToken) {
          const { error: err } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
          if (err) throw err;
        } else if (code) {
          const { error: err } = await supabase.auth.exchangeCodeForSession(code);
          if (err) throw err;
        } else {
          // No recovery token in the URL. Fall back to an existing session if any.
          const { data } = await supabase.auth.getSession();
          if (!data?.session) {
            if (active) setPhase("invalid");
            return;
          }
        }

        // Strip the token from the URL so a refresh does not reprocess it.
        window.history.replaceState(null, "", window.location.pathname);
        if (active) setPhase("ready");
      } catch {
        if (active) setPhase("invalid");
      }
    }
    establish();
    return () => { active = false; };
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(t("auth.pwTooShort"));
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      // Sign out the recovery session so the user logs in fresh with the new
      // password. Marked as intentional so the session-expiry handler in
      // useAuth does not show its "session expired" message here.
      markManualSignOut();
      await supabase.auth.signOut();
      setPhase("done");
    } catch (err) {
      setError(err.message || t("auth.resetError"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center isolate">
      <GlowBackdrop/>
      <Header showBack/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
          <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{t("auth.resetTitle")}</motion.h2>
          <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">{t("auth.resetSub")}</motion.p>
        </motion.div>

        <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
          {phase === "checking" && (
            <p className="text-sm text-ink-500 text-center">{t("auth.resetChecking")}</p>
          )}

          {phase === "invalid" && (
            <div className="text-center">
              <p className="text-sm text-ink-700">{t("auth.resetInvalid")}</p>
              <Link to="/forgot-password" className="mt-4 inline-block text-sm font-semibold text-coorg-700 hover:text-coorg-800">{t("auth.resetRequestNew")}</Link>
            </div>
          )}

          {phase === "done" && (
            <div className="text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-crop-50 text-crop-600 grid place-items-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p className="text-sm text-ink-700">{t("auth.resetDone")}</p>
              <Button className="w-full mt-5" onClick={() => nav("/login")}>{t("auth.resetGoLogin")}</Button>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={onSubmit} className="space-y-4">
              <PasswordInput label={t("auth.newPassword")} autoComplete="new-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)}/>
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{error}</div>
              )}
              <Button type="submit" loading={loading} className="w-full">
                {loading ? t("common.loading") : t("auth.updatePassword")}
              </Button>
            </form>
          )}
        </motion.div>
      </main>
    </div>
  );
}

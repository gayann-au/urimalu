import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";
import { markManualSignOut } from "./useAuth";
import { useUriMotion } from "../../lib/uiMotion";

// Step two of password recovery, reached from the reset email link. The supabase
// client is created with detectSessionInUrl false, so we establish the recovery
// session by hand: implicit links carry access and refresh tokens in the URL
// hash, PKCE links carry a code query param. Once a session is in place the user
// can set a new password, after which we sign out so they log in fresh.
export default function ResetPasswordPage() {
  const m = useUriMotion();
  const nav = useNavigate();
  const [phase, setPhase] = useState("checking"); // checking | ready | invalid | done
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
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
      setError("Password must be at least 6 characters.");
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
      setError(err.message || "Could not update your password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center">
      <Header showBack/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
          <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">Set a new password</motion.h2>
          <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">Choose a new password for your account.</motion.p>
        </motion.div>

        <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
          {phase === "checking" && (
            <p className="text-sm text-ink-500 text-center">Checking your reset link...</p>
          )}

          {phase === "invalid" && (
            <div className="text-center">
              <p className="text-sm text-ink-700">This reset link is invalid or has expired.</p>
              <Link to="/forgot-password" className="mt-4 inline-block text-sm font-semibold text-coorg-700 hover:text-coorg-800">Request a new link</Link>
            </div>
          )}

          {phase === "done" && (
            <div className="text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-crop-50 text-crop-600 grid place-items-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p className="text-sm text-ink-700">Your password has been updated. You can now log in.</p>
              <Button className="w-full mt-5" onClick={() => nav("/login")}>Go to log in</Button>
            </div>
          )}

          {phase === "ready" && (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="relative">
                <Input label="New password" type={showPw ? "text" : "password"} autoComplete="new-password" maxLength={72} value={password} onChange={(e) => setPassword(e.target.value)}/>
                <button
                  type="button"
                  onClick={() => setShowPw(s => !s)}
                  className="absolute right-3 bottom-3 text-ink-500 hover:text-ink-800"
                >
                  {showPw ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  )}
                </button>
              </div>
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{error}</div>
              )}
              <Button type="submit" loading={loading} className="w-full">
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          )}
        </motion.div>
      </main>
    </div>
  );
}

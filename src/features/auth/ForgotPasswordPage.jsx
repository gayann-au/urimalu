import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { supabase } from "../../lib/supabase";
import { useUriMotion } from "../../lib/uiMotion";

// Step one of password recovery. The user enters their email and Supabase Auth
// sends a reset link that points back at /reset-password. Strings are plain
// English here rather than i18n, to keep this rare auxiliary flow self contained.
export default function ForgotPasswordPage() {
  const m = useUriMotion();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(e) {
    e.preventDefault();
    setError(null);
    const addr = email.trim();
    if (!addr) {
      setError("Please enter your email.");
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.resetPasswordForEmail(addr, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (err) throw err;
      setSent(true);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center">
      <Header showBack/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
          <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">Forgot password</motion.h2>
          <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">Enter your email and we will send you a link to reset it.</motion.p>
        </motion.div>

        <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto h-14 w-14 rounded-full bg-crop-50 text-crop-600 grid place-items-center mb-3">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>
              </div>
              <p className="text-sm text-ink-700">
                If an account exists for <span className="font-semibold text-ink-900 break-words">{email.trim()}</span>, a reset link is on its way. Check your inbox.
              </p>
              <Link to="/login" className="mt-5 inline-block text-sm font-semibold text-coorg-700 hover:text-coorg-800">Back to log in</Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <Input label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)}/>
              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{error}</div>
              )}
              <Button type="submit" loading={loading} className="w-full">
                {loading ? "Sending..." : "Send reset link"}
              </Button>
              <Link to="/login" className="block text-center text-sm text-coorg-700 font-semibold py-2 hover:text-coorg-800">Back to log in</Link>
            </form>
          )}
        </motion.div>
      </main>
    </div>
  );
}

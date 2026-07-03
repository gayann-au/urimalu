import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useLogin, useGoogleLogin } from "./useAuth";
import { GoogleSignInButton } from "./GoogleSignInButton";
import LegalConsent from "../legal/LegalConsent";
import { useUriMotion } from "../../lib/uiMotion";

const schema = z.object({
  email: z.string().email("auth.emailInvalid"),
  password: z.string().min(6, "auth.pwTooShort"),
});

export default function LoginPage() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const login = useLogin();
  const googleLogin = useGoogleLogin();
  const [topError, setTopError] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(values) {
    setTopError(null);
    try {
      await login.mutateAsync(values);
    } catch (e) {
      setTopError(e?.code || "auth.loginError");
    }
  }

  // Receives the signed credential from Google Identity Services and exchanges
  // it for a Supabase session. Errors surface through the same top banner.
  const onGoogleCredential = useCallback(async (credential) => {
    setTopError(null);
    try {
      await googleLogin.mutateAsync(credential);
    } catch (e) {
      setTopError(e?.code || "auth.googleError");
    }
  }, [googleLogin]);

  return (
    <div className="flex flex-col flex-1 items-center">
      <Header showBack/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
          <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{t("auth.loginTitle")}</motion.h2>
          <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">{t("auth.loginSub")}</motion.p>
        </motion.div>

        <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label={t("auth.email")} type="email" autoComplete="email" maxLength={255}
              {...register("email")} error={errors.email ? t(errors.email.message) : null}/>
            <div className="relative">
              <Input label={t("auth.password")} type={showPw ? "text" : "password"} autoComplete="current-password" maxLength={72}
                {...register("password")} error={errors.password ? t(errors.password.message) : null}/>
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
            <div className="text-right -mt-1">
              <Link to="/forgot-password" className="text-sm font-semibold text-coorg-700 hover:text-coorg-800">{t("auth.forgotPwLink")}</Link>
            </div>
            {topError && (
              <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">
                {t(topError)}
              </div>
            )}
            <Button type="submit" loading={login.isPending} className="w-full">
              {login.isPending ? t("common.loading") : t("nav.login")}
            </Button>
          </form>
          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-ink-200" />
            <span className="text-xs uppercase tracking-wide text-ink-500">{t("auth.orDivider")}</span>
            <span className="h-px flex-1 bg-ink-200" />
          </div>
          <GoogleSignInButton onCredential={onGoogleCredential} />
          <LegalConsent action="continuing" />
        </motion.div>

        <div className="mt-7 text-center">
          <p className="text-sm text-ink-500">{t("auth.newHere")}</p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            <Link to="/signup/farmer">
              <Button variant="outline" className="w-full">{t("auth.signupAsFarmer")}</Button>
            </Link>
            <Link to="/signup/merchant">
              <Button variant="outline" className="w-full">{t("auth.signupAsMerchant")}</Button>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

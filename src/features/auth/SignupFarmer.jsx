import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { DistrictPicker } from "./DistrictPicker";
import { useSignupFarmer } from "./useAuth";
import LegalConsent from "../legal/LegalConsent";
import { useUriMotion } from "../../lib/uiMotion";
import { phoneRegex } from "../../lib/constants";

const schema = z.object({
  fullName: z.string().min(2, "auth.fullName"),
  phone: z.string().regex(phoneRegex, "auth.phoneInvalid"),
  email: z.string().email("auth.emailInvalid"),
  password: z.string().min(6, "auth.pwTooShort"),
});

export default function SignupFarmer() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const signup = useSignupFarmer();
  const [stage, setStage] = useState("form"); // form -> district
  const [formValues, setFormValues] = useState(null);
  const [topError, setTopError] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  // Stage 1: the details form only advances to the district step. The account
  // is deliberately NOT created here. Previously onSubmit created the account,
  // and useSignupFarmer's onSuccess navigated straight to the feed, so the
  // district step never had a chance to render. Holding the values and creating
  // the account only after a district is picked guarantees the farmer is asked
  // for their district as part of signup, before landing on the feed.
  function onSubmit(values) {
    setTopError(null);
    setFormValues(values);
    setStage("district");
  }

  // Stage 2: create the account with the chosen district in a single write.
  // On success useSignupFarmer navigates to the feed. On failure (for example
  // an email already registered) the message belongs on the details form, so
  // return there with the error rather than stranding the farmer on the
  // district step.
  async function pickDistrict(d) {
    setTopError(null);
    try {
      await signup.mutateAsync({ ...formValues, district: d });
    } catch (e) {
      setTopError(e?.code || "auth.loginError");
      setStage("form");
    }
  }

  return (
    <div className="flex flex-col flex-1 items-center isolate">
      <GlowBackdrop/>
      <Header showBack/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        {stage === "form" && (
          <>
            <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
              <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{t("auth.farmerSignup")}</motion.h2>
            </motion.div>
            <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <Input label={t("auth.fullName")} maxLength={100} {...register("fullName")} error={errors.fullName ? t(errors.fullName.message) : null}/>
                <Input label={t("auth.phone")} type="tel" maxLength={10} placeholder="98XXXXXXXX" {...register("phone")} error={errors.phone ? t(errors.phone.message) : null}/>
                <Input label={t("auth.email")} type="email" autoComplete="email" maxLength={255} {...register("email")} error={errors.email ? t(errors.email.message) : null}/>
                <div className="relative">
                  <Input label={t("auth.password")} type={showPw ? "text" : "password"} autoComplete="new-password" maxLength={72} {...register("password")} error={errors.password ? t(errors.password.message) : null}/>
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
                {topError && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{t(topError)}</div>}
                <Button type="submit" className="w-full">{t("nav.signup")}</Button>
                <LegalConsent action="signing up" />
                <Link to="/login" className="block text-center text-sm text-coorg-700 font-semibold py-2">{t("nav.login")}</Link>
              </form>
            </motion.div>
          </>
        )}

        {stage === "district" && (
          <DistrictPicker onPick={pickDistrict} busy={signup.isPending} />
        )}
      </main>
    </div>
  );
}

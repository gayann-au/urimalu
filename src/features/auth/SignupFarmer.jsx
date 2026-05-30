import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useSignupFarmer } from "./useAuth";
import { DISTRICTS, phoneRegex } from "../../lib/constants";

const schema = z.object({
  fullName: z.string().min(2, "auth.fullName"),
  phone: z.string().regex(phoneRegex, "auth.phoneInvalid"),
  email: z.string().email("auth.emailInvalid"),
  password: z.string().min(6, "auth.pwTooShort"),
});

export default function SignupFarmer() {
  const { t } = useTranslation();
  const signup = useSignupFarmer();
  const [stage, setStage] = useState("form"); // form -> district
  const [profile, setProfile] = useState(null);
  const [district, setDistrict] = useState(null);
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(values) {
    setTopError(null);
    try {
      const p = await signup.mutateAsync({ ...values });
      setProfile(p);
      setStage("district");
    } catch (e) { setTopError(e?.code || "auth.loginError"); }
  }

  async function pickDistrict(d) {
    setDistrict(d);
    // Update profile with district then nav to feed (handled in mutation success)
    const { supabase } = await import("../../lib/supabase");
    await supabase.from("users").update({ district: d }).eq("id", profile.id);
    window.location.href = "/";
  }

  return (
    <div className="flex flex-col flex-1">
      <Header showBack/>
      <main className="px-5 py-5 flex-1">
        {stage === "form" && (
          <>
            <div className="text-center mb-5">
              <h2 className="text-2xl font-extrabold text-gray-900">{t("auth.farmerSignup")}</h2>
            </div>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <Input label={t("auth.fullName")} {...register("fullName")} error={errors.fullName ? t(errors.fullName.message) : null}/>
              <Input label={t("auth.phone")} type="tel" placeholder="98XXXXXXXX" {...register("phone")} error={errors.phone ? t(errors.phone.message) : null}/>
              <Input label={t("auth.email")} type="email" autoComplete="email" {...register("email")} error={errors.email ? t(errors.email.message) : null}/>
              <Input label={t("auth.password")} type="password" autoComplete="new-password" {...register("password")} error={errors.password ? t(errors.password.message) : null}/>
              {topError && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{t(topError)}</div>}
              <Button type="submit" loading={signup.isPending} className="w-full">{signup.isPending ? t("common.loading") : t("nav.signup")}</Button>
              <Link to="/login" className="block text-center text-sm text-coorg-700 font-semibold py-2">{t("nav.login")}</Link>
            </form>
          </>
        )}

        {stage === "district" && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
            <div className="w-full max-w-[430px] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:m-4">
              <div className="text-center">
                <h3 className="text-xl font-extrabold text-gray-900">Where are you from?</h3>
                <p className="text-sm text-gray-500 mt-1">Pick your district to see local rates</p>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {DISTRICTS.map(d => (
                  <button key={d} onClick={() => pickDistrict(d)}
                    className="rounded-xl border-2 border-coorg-200 hover:border-coorg-600 hover:bg-coorg-50 py-3 font-bold text-coorg-800 transition">
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
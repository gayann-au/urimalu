import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { useLogin } from "./useAuth";

const schema = z.object({
  email: z.string().email("auth.emailInvalid"),
  password: z.string().min(6, "auth.pwTooShort"),
});

export default function LoginPage() {
  const { t } = useTranslation();
  const login = useLogin();
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema) });

  async function onSubmit(values) {
    setTopError(null);
    try {
      await login.mutateAsync(values);
    } catch (e) {
      setTopError(e?.code || "auth.loginError");
    }
  }

  return (
    <div className="flex flex-col flex-1">
      <Header showBack/>
      <main className="px-5 py-6 flex-1">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-extrabold text-gray-900">{t("auth.loginTitle")}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("auth.loginSub")}</p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label={t("auth.email")} type="email" autoComplete="email"
            {...register("email")} error={errors.email ? t(errors.email.message) : null}/>
          <Input label={t("auth.password")} type="password" autoComplete="current-password"
            {...register("password")} error={errors.password ? t(errors.password.message) : null}/>
          {topError && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">
              {t(topError)}
            </div>
          )}
          <Button type="submit" loading={login.isPending} className="w-full">
            {login.isPending ? t("common.loading") : t("nav.login")}
          </Button>
        </form>
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">{t("auth.newHere")}</p>
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
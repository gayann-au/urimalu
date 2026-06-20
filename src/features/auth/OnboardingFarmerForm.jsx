import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { useFarmerOnboarding } from "./useOnboarding";
import { DISTRICTS, phoneRegex } from "../../lib/constants";

// Farmer half of Google onboarding. Collects the same profile fields the
// password farmer sign-up collects (full name, phone, district), minus the
// email and password, which the Google session already provides. Email and
// password are never asked here, so this does not duplicate the password
// sign-up flow.
const schema = z.object({
  fullName: z.string().min(2, "auth.fullName"),
  phone: z.string().regex(phoneRegex, "auth.phoneInvalid"),
  district: z.string(),
});

export default function OnboardingFarmerForm({ onBack }) {
  const { t } = useTranslation();
  const onboard = useFarmerOnboarding();
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { district: DISTRICTS[0] },
  });

  async function onSubmit(values) {
    setTopError(null);
    try {
      await onboard.mutateAsync(values);
    } catch (e) {
      setTopError(e?.code || "auth.onboardingError");
    }
  }

  return (
    <div>
      <div className="text-center mb-5">
        <h2 className="text-2xl font-extrabold text-gray-900">{t("onboarding.farmerFormTitle")}</h2>
        <p className="text-sm text-gray-500 mt-1">{t("onboarding.farmerFormSub")}</p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <Input label={t("auth.fullName")} {...register("fullName")}
          error={errors.fullName ? t(errors.fullName.message) : null}/>
        <Input label={t("auth.phone")} type="tel" placeholder="98XXXXXXXX" {...register("phone")}
          error={errors.phone ? t(errors.phone.message) : null}/>
        <Select label={t("auth.district")} {...register("district")}>
          {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
        </Select>
        {topError && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">
            {t(topError)}
          </div>
        )}
        <Button type="submit" loading={onboard.isPending} className="w-full">
          {onboard.isPending ? t("common.loading") : t("onboarding.finish")}
        </Button>
        <button type="button" onClick={onBack}
          className="block text-center text-sm text-gray-600 py-2 w-full">
          {t("onboarding.back")}
        </button>
      </form>
    </div>
  );
}

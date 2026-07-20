import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Input, Select } from "../../components/ui/Input";
import { useFarmerOnboarding } from "./useOnboarding";
import { useUriMotion } from "../../lib/uiMotion";
import { DISTRICTS } from "../../lib/constants";
import { PhoneField } from "../../components/ui/PhoneField";
import { isValidPhone, DEFAULT_PHONE_COUNTRY } from "../../lib/phone";

// Farmer half of Google onboarding. Collects the same profile fields the
// password farmer sign-up collects (full name, phone, district), minus the
// email and password, which the Google session already provides. Email and
// password are never asked here, so this does not duplicate the password
// sign-up flow.
const schema = z.object({
  fullName: z.string().trim().min(2, "auth.fullName"),
  phone: z.string(),
  phoneCountry: z.string().default("IN"),
  district: z.string(),
}).superRefine((v, ctx) => {
  if (!isValidPhone(v.phone, v.phoneCountry))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "auth.phoneInvalid", path: ["phone"] });
});

export default function OnboardingFarmerForm({ onBack }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const onboard = useFarmerOnboarding();
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { district: DISTRICTS[0], phoneCountry: DEFAULT_PHONE_COUNTRY },
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
      <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
        <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{t("onboarding.farmerFormTitle")}</motion.h2>
        <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">{t("onboarding.farmerFormSub")}</motion.p>
      </motion.div>
      <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label={t("auth.fullName")} maxLength={100} {...register("fullName")}
            error={errors.fullName ? t(errors.fullName.message) : null}/>
          <PhoneField label={t("auth.phone")} countryReg={register("phoneCountry")} numberReg={register("phone")}
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
            className="block text-center text-sm text-ink-600 py-2 w-full">
            {t("onboarding.back")}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

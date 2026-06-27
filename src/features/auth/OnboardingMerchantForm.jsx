import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { useMerchantOnboarding } from "./useOnboarding";
import { useUriMotion } from "../../lib/uiMotion";
import {
  DISTRICTS, YEARS_TRADING, BUSINESS_TYPES, CROPS_TRADED, phoneRegex,
} from "../../lib/constants";

// Merchant half of Google onboarding. Collects the same business profile the
// password merchant sign-up collects, minus the email and password, which the
// Google session already provides. A dedicated form (rather than reusing the
// password sign-up component) keeps the first time wording correct and leaves
// the existing sign-up flow untouched. On submit the merchant lands on the
// pending page, in the same PENDING state as a password merchant sign-up.
const schema = z.object({
  businessName: z.string().min(2, "auth.businessName"),
  ownerName: z.string().min(2, "auth.ownerName"),
  phone: z.string().regex(phoneRegex, "auth.phoneInvalid"),
  whatsappSame: z.boolean().default(true),
  whatsapp: z.string().optional(),
  town: z.string().min(2, "auth.town"),
  district: z.string(),
  yearsTrading: z.string(),
  businessType: z.string(),
  cropsTraded: z.array(z.string()).min(1, "auth.cropsTraded"),
  businessDescription: z.string().max(200).optional(),
}).refine(
  (v) => v.whatsappSame || (v.whatsapp && phoneRegex.test(v.whatsapp)),
  { message: "auth.phoneInvalid", path: ["whatsapp"] }
);

export default function OnboardingMerchantForm({ onBack }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const onboard = useMerchantOnboarding();
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      whatsappSame: true,
      district: DISTRICTS[0],
      yearsTrading: YEARS_TRADING[1].value,
      businessType: BUSINESS_TYPES[0].value,
      cropsTraded: ["coffee"],
      businessDescription: "",
    },
  });
  const desc = watch("businessDescription") || "";
  const cropsTraded = watch("cropsTraded") || [];
  const waSame = watch("whatsappSame");

  function toggleCrop(c) {
    setValue(
      "cropsTraded",
      cropsTraded.includes(c) ? cropsTraded.filter((x) => x !== c) : [...cropsTraded, c],
      { shouldValidate: true }
    );
  }

  async function onSubmit(values) {
    setTopError(null);
    try {
      await onboard.mutateAsync({
        ...values,
        whatsapp: values.whatsappSame ? values.phone : values.whatsapp,
      });
    } catch (e) {
      setTopError(e?.code || "auth.onboardingError");
    }
  }

  return (
    <div>
      <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
        <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{t("onboarding.merchantFormTitle")}</motion.h2>
        <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">{t("onboarding.merchantFormSub")}</motion.p>
      </motion.div>
      <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label={t("auth.businessName")} {...register("businessName")}
            error={errors.businessName ? t(errors.businessName.message) : null}/>
          <Input label={t("auth.ownerName")} {...register("ownerName")}
            error={errors.ownerName ? t(errors.ownerName.message) : null}/>
          <Input label={t("auth.phone")} type="tel" placeholder="98XXXXXXXX" {...register("phone")}
            error={errors.phone ? t(errors.phone.message) : null}/>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-ink-700">{t("auth.whatsappNum")}</label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-600">
                <input type="checkbox" {...register("whatsappSame")} className="h-4 w-4 accent-coorg-600"/>
                {t("auth.sameAsPhone")}
              </label>
            </div>
            <Input type="tel" disabled={waSame} placeholder="98XXXXXXXX" {...register("whatsapp")}
              error={errors.whatsapp && !waSame ? t(errors.whatsapp.message) : null}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("auth.town")} {...register("town")}
              error={errors.town ? t(errors.town.message) : null}/>
            <Select label={t("auth.district")} {...register("district")}>
              {DISTRICTS.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
          </div>

          <Select label={t("auth.yearsTrading")} {...register("yearsTrading")}>
            {YEARS_TRADING.map(y => <option key={y.value} value={y.value}>{t(y.labelKey)}</option>)}
          </Select>

          <Select label={t("auth.businessType")} {...register("businessType")}>
            {BUSINESS_TYPES.map(b => <option key={b.value} value={b.value}>{t(b.labelKey)}</option>)}
          </Select>

          <div>
            <label className="block text-sm font-semibold text-ink-700 mb-1.5">{t("auth.cropsTraded")}</label>
            <div className="flex flex-wrap gap-2">
              {CROPS_TRADED.map(c => {
                const active = cropsTraded.includes(c);
                return (
                  <button type="button" key={c} onClick={() => toggleCrop(c)}
                    className={`rounded-full px-3.5 py-1.5 text-xs font-bold border-2 min-h-[36px] transition-colors ${
                      active ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-ink-700 border-ink-200 hover:border-coorg-300"
                    }`}>
                    {t(`crops.${c}`)}
                  </button>
                );
              })}
            </div>
            {errors.cropsTraded && <p className="text-xs text-red-600 mt-1">{t(errors.cropsTraded.message)}</p>}
          </div>

          <Textarea label={t("auth.businessDesc") + " " + t("common.optional")}
            placeholder={t("auth.businessDescPh")}
            maxLength={200} {...register("businessDescription")} value={desc}/>

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

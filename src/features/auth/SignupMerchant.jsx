import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { PasswordInput } from "../../components/ui/PasswordInput";
import { useSignupMerchant } from "./useAuth";
import LegalConsent from "../legal/LegalConsent";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { toast } from "../../components/ui/Toast";
import { useUriMotion } from "../../lib/uiMotion";
import {
  DISTRICTS, YEARS_TRADING, BUSINESS_TYPES, CROPS_TRADED, phoneRegex,
} from "../../lib/constants";

const profileShape = {
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
};

const whatsappRefine = (v) => v.whatsappSame || (v.whatsapp && phoneRegex.test(v.whatsapp));

const registerSchema = z.object({
  ...profileShape,
  email: z.string().email("auth.emailInvalid"),
  password: z.string().min(6, "auth.pwTooShort"),
}).refine(whatsappRefine, { message: "auth.phoneInvalid", path: ["whatsapp"] });

const resubmitSchema = z.object(profileShape)
  .refine(whatsappRefine, { message: "auth.phoneInvalid", path: ["whatsapp"] });

export default function SignupMerchant({ resubmitMode = false, prefill = null, onAfterResubmit = null }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const signup = useSignupMerchant();
  const qc = useQueryClient();
  const [topError, setTopError] = useState(null);
  const [resubmitting, setResubmitting] = useState(false);

  const profileDefaults = prefill ? {
    businessName: prefill.business_name || "",
    ownerName: prefill.owner_name || "",
    phone: prefill.phone || "",
    whatsappSame: !prefill.whatsapp || prefill.whatsapp === prefill.phone,
    whatsapp: prefill.whatsapp || "",
    town: prefill.town || "",
    district: prefill.district || DISTRICTS[0],
    yearsTrading: prefill.years_trading || YEARS_TRADING[1].value,
    businessType: prefill.business_type || BUSINESS_TYPES[0].value,
    cropsTraded: prefill.crops_traded || ["coffee"],
    businessDescription: prefill.business_description || "",
  } : {
    whatsappSame: true,
    district: DISTRICTS[0],
    yearsTrading: YEARS_TRADING[1].value,
    businessType: BUSINESS_TYPES[0].value,
    cropsTraded: ["coffee"],
    businessDescription: "",
  };

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(resubmitMode ? resubmitSchema : registerSchema),
    defaultValues: profileDefaults,
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
    if (resubmitMode) {
      setResubmitting(true);
      try {
        const patch = {
          business_name: values.businessName.trim(),
          owner_name: values.ownerName.trim(),
          phone: values.phone.trim(),
          whatsapp: (values.whatsappSame ? values.phone : values.whatsapp).trim(),
          town: values.town.trim(),
          district: values.district,
          years_trading: values.yearsTrading,
          business_type: values.businessType,
          crops_traded: values.cropsTraded,
          business_description: (values.businessDescription || "").slice(0, 200) || null,
          rejection_reason: null,
          status: "PENDING",
          resubmitted_at: new Date().toISOString(),
        };
        // RETURNING is only used to detect an RLS-blocked update (zero rows
        // back). "id" keeps that check working. A bare .select() means
        // RETURNING *, which the users column grants no longer allow.
        const { data, error } = await supabase.from("users").update(patch).eq("id", prefill.id).select("id");
        if (error) throw new Error(error.message);
        if (!data || data.length === 0) throw new Error("admin.rlsBlocked");
        qc.invalidateQueries({ queryKey: qk.users });
        qc.invalidateQueries({ queryKey: qk.profile(prefill.id) });
        toast({ text: t("pending.resubmitToast") });
        onAfterResubmit?.();
      } catch (e) {
        setTopError(e.message?.startsWith("admin.") ? e.message : (e.message || "auth.loginError"));
      } finally {
        setResubmitting(false);
      }
      return;
    }
    try {
      await signup.mutateAsync({
        ...values,
        whatsapp: values.whatsappSame ? values.phone : values.whatsapp,
      });
      // Merchant goes to the pending page via the existing post-signup redirect.
    } catch (e) {
      setTopError(e?.code || "auth.loginError");
    }
  }

  const submitting = resubmitMode ? resubmitting : signup.isPending;

  return (
    <div className="flex flex-col flex-1 pb-8 items-center isolate">
      <GlowBackdrop/>
      <Header showBack/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <motion.div variants={m.stagger} initial="hidden" animate="show" className="text-center mb-6">
          <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">
            {resubmitMode ? t("pending.resubmitTitle") : t("auth.merchantSignup")}
          </motion.h2>
          <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">
            {resubmitMode ? t("pending.resubmitSub") : t("auth.merchantSignupSub")}
          </motion.p>
        </motion.div>
        <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <Input label={t("auth.businessName")} maxLength={100} {...register("businessName")} error={errors.businessName ? t(errors.businessName.message) : null}/>
            <Input label={t("auth.ownerName")} maxLength={100}    {...register("ownerName")}    error={errors.ownerName ? t(errors.ownerName.message) : null}/>
            <Input label={t("auth.phone")} type="tel" maxLength={10} placeholder="98XXXXXXXX" {...register("phone")} error={errors.phone ? t(errors.phone.message) : null}/>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-ink-700">{t("auth.whatsappNum")}</label>
                <label className="inline-flex items-center gap-2 text-xs font-semibold text-ink-600">
                  <input type="checkbox" {...register("whatsappSame")} className="h-4 w-4 accent-coorg-600"/>
                  {t("auth.sameAsPhone")}
                </label>
              </div>
              <Input type="tel" disabled={waSame} maxLength={10} placeholder="98XXXXXXXX" {...register("whatsapp")}
                error={errors.whatsapp && !waSame ? t(errors.whatsapp.message) : null}/>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input label={t("auth.town")} maxLength={100} {...register("town")} error={errors.town ? t(errors.town.message) : null}/>
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
                      className={`rounded-full px-3.5 py-1.5 text-xs font-bold border-2 min-h-[40px] transition-colors ${
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

            {!resubmitMode && (
              <>
                <Input label={t("auth.email")} type="email" autoComplete="email" maxLength={255}
                  {...register("email")} error={errors.email ? t(errors.email.message) : null}/>
                <PasswordInput label={t("auth.password")} autoComplete="new-password" maxLength={72}
                  {...register("password")} error={errors.password ? t(errors.password.message) : null}/>
              </>
            )}

            {topError && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{t(topError)}</div>}

            <Button type="submit" loading={submitting} className="w-full">
              {submitting ? t("common.loading") : (resubmitMode ? t("pending.resubmitBtn") : t("auth.register"))}
            </Button>
            {resubmitMode ? (
              <button type="button" onClick={() => onAfterResubmit?.()}
                className="block text-center text-sm text-ink-600 py-2 w-full">
                {t("common.cancel")}
              </button>
            ) : (
              <>
                <LegalConsent action="registering" />
                <Link to="/login" className="block text-center text-sm text-coorg-700 font-semibold py-2">{t("nav.login")}</Link>
              </>
            )}
          </form>
        </motion.div>
      </main>
    </div>
  );
}

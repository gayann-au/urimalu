import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion } from "framer-motion";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { toast } from "../../components/ui/Toast";
import { useUpdateOwnProfile } from "./useAccount";
import { useUriMotion } from "../../lib/uiMotion";
import {
  DISTRICTS, YEARS_TRADING, BUSINESS_TYPES, CROPS_TRADED, phoneRegex,
} from "../../lib/constants";

// Merchant self-edit form. Same business fields and validation as the merchant
// signup, resubmit, and onboarding forms, prefilled from the current profile,
// with a self-update instead of a create.
//
// Re-review rule: changing what admin actually approved (business name, business
// type, or crops traded) sends the merchant back to PENDING, reusing the exact
// move-to-PENDING the resubmit flow performs in SignupMerchant. Editing only
// contact, owner, town, district, years, or description leaves status alone, so
// an approved merchant stays approved.
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

// Compares two crop lists ignoring order, so merely reordering the selection is
// not treated as a change that needs re-review.
function sameStringArray(a, b) {
  const x = [...(a || [])].map(String).sort();
  const y = [...(b || [])].map(String).sort();
  return x.length === y.length && x.every((v, i) => v === y[i]);
}

export default function AccountMerchantForm({ profile }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const nav = useNavigate();
  const update = useUpdateOwnProfile();
  const [topError, setTopError] = useState(null);
  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      businessName: profile.business_name || "",
      ownerName: profile.owner_name || "",
      phone: profile.phone || "",
      whatsappSame: !profile.whatsapp || profile.whatsapp === profile.phone,
      whatsapp: profile.whatsapp || "",
      town: profile.town || "",
      district: profile.district || DISTRICTS[0],
      yearsTrading: profile.years_trading || YEARS_TRADING[1].value,
      businessType: profile.business_type || BUSINESS_TYPES[0].value,
      cropsTraded: profile.crops_traded || ["coffee"],
      businessDescription: profile.business_description || "",
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

    // Only the fields admin reviews (business name, business type, crops) force
    // a fresh review. Everything else updates in place without changing status.
    const needsReview =
      values.businessName.trim() !== (profile.business_name || "") ||
      values.businessType !== profile.business_type ||
      !sameStringArray(values.cropsTraded, profile.crops_traded);

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
    };

    if (needsReview) {
      // Same three fields the resubmit flow sets, so the existing self-update
      // RLS policy that permits the move to PENDING applies here too.
      patch.status = "PENDING";
      patch.resubmitted_at = new Date().toISOString();
      patch.rejection_reason = null;
    }

    try {
      await update.mutateAsync({ userId: profile.id, patch });
      if (needsReview) {
        toast({ text: t("account.savedPending") });
        nav("/merchant/pending", { replace: true });
      } else {
        toast({ text: t("account.saved") });
      }
    } catch (e) {
      setTopError(e.message?.startsWith("account.") ? e.message : "account.saveError");
    }
  }

  return (
    <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 md:p-7">
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* Heads-up that the three review-sensitive fields below (business name,
            business type, crops) need a quick approval before they show again.
            Contact, owner, town, district, years, and description save instantly. */}
        <div className="rounded-xl bg-coorg-50 border border-coorg-200 text-coorg-900 px-3 py-2.5 text-xs leading-relaxed flex gap-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="16" x2="12" y2="12"/>
            <line x1="12" y1="8" x2="12.01" y2="8"/>
          </svg>
          <span>{t("account.reviewNotice")}</span>
        </div>
        <Input label={t("auth.businessName")} maxLength={100} {...register("businessName")}
          error={errors.businessName ? t(errors.businessName.message) : null}/>
        <Input label={t("auth.ownerName")} maxLength={100} {...register("ownerName")}
          error={errors.ownerName ? t(errors.ownerName.message) : null}/>
        <Input label={t("auth.phone")} type="tel" maxLength={10} placeholder="98XXXXXXXX" {...register("phone")}
          error={errors.phone ? t(errors.phone.message) : null}/>
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
          <Input label={t("auth.town")} maxLength={100} {...register("town")}
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

        {topError && (
          <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">
            {t(topError)}
          </div>
        )}

        <Button type="submit" loading={update.isPending} className="w-full">
          {update.isPending ? t("common.loading") : t("common.save")}
        </Button>
      </form>
    </motion.div>
  );
}

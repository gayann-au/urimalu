import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { Toggle } from "../../components/ui/Toggle";
import { useSignupMerchant } from "./useAuth";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { toast } from "../../components/ui/Toast";
import {
  DISTRICTS, YEARS_TRADING, BUSINESS_TYPES, CROPS_TRADED, phoneRegex,
  COFFEE_SECTIONS, DELIVERY_POINTS, PAYMENT_MODES,
} from "../../lib/constants";

const optNum = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().positive().max(999999).nullable());
const optStr = z.string().optional();
const contactSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional().refine(v => !v || phoneRegex.test(v), { message: "auth.phoneInvalid" }),
});

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

const rateShape = {
  rc_ep_price: optNum, rc_spot_lift_price: optNum, rc_delivery_price: optNum, rc_moisture_pct: optNum,
  rc_spot_lifting: z.boolean().default(false),
  rc_old_ep_price: optNum, rc_old_spot_lifting: z.boolean().default(false),
  ot_price: optNum,
  ac_price: optNum, ac_call_for_price: z.boolean().default(false),
  ap_price: optNum, rp_price: optNum,
  pepper_price: optNum, pepper_call_for_price: z.boolean().default(false),
  cardamom_price: optNum,
  spot_payment: z.boolean().default(false),
  payment_mode: z.string().default("cash"),
  commitment_time: optStr,
  valid_till: optStr,
  subject_to_reconfirmation: z.boolean().default(false),
  delivery_points: z.array(z.string()).default([]),
  contact_1: contactSchema, contact_2: contactSchema, contact_3: contactSchema,
  notes: optStr,
};

function rateRefine(v, ctx) {
  const anyPrice = [
    v.rc_ep_price, v.rc_spot_lift_price, v.rc_delivery_price,
    v.rc_old_ep_price, v.ot_price, v.ac_price, v.ap_price, v.rp_price,
    v.pepper_price, v.cardamom_price,
  ].some(x => x != null && x > 0);
  const anyCFP = v.ac_call_for_price || v.pepper_call_for_price;
  if (!anyPrice && !anyCFP) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "form.needOnePrice", path: ["rc_ep_price"] });
  }
}

const whatsappRefine = (v) => v.whatsappSame || (v.whatsapp && phoneRegex.test(v.whatsapp));

const registerSchema = z.object({
  ...profileShape,
  ...rateShape,
  email: z.string().email("auth.emailInvalid"),
  password: z.string().min(6, "auth.pwTooShort"),
}).refine(whatsappRefine, { message: "auth.phoneInvalid", path: ["whatsapp"] })
  .superRefine(rateRefine);

const resubmitSchema = z.object({ ...profileShape, ...rateShape })
  .refine(whatsappRefine, { message: "auth.phoneInvalid", path: ["whatsapp"] })
  .superRefine(rateRefine);

function buildRateJson(v) {
  return {
    rc_ep_price: v.rc_ep_price,
    rc_spot_lift_price: v.rc_spot_lift_price,
    rc_delivery_price: v.rc_delivery_price,
    rc_moisture_pct: v.rc_moisture_pct,
    rc_spot_lifting: v.rc_spot_lifting,
    rc_old_ep_price: v.rc_old_ep_price,
    rc_old_spot_lifting: v.rc_old_spot_lifting,
    ot_price: v.ot_price,
    ac_price: v.ac_call_for_price ? null : v.ac_price,
    ac_call_for_price: v.ac_call_for_price,
    ap_price: v.ap_price,
    rp_price: v.rp_price,
    pepper_price: v.pepper_call_for_price ? null : v.pepper_price,
    pepper_call_for_price: v.pepper_call_for_price,
    cardamom_price: v.cardamom_price,
    spot_payment: v.spot_payment,
    payment_mode: v.payment_mode,
    commitment_time: v.commitment_time || null,
    valid_till: v.valid_till || null,
    subject_to_reconfirmation: v.subject_to_reconfirmation,
    delivery_points: v.delivery_points || [],
    contact_1_name: v.contact_1?.name || null,
    contact_1_phone: v.contact_1?.phone || null,
    contact_2_name: v.contact_2?.name || null,
    contact_2_phone: v.contact_2?.phone || null,
    contact_3_name: v.contact_3?.name || null,
    contact_3_phone: v.contact_3?.phone || null,
    notes: v.notes || null,
  };
}

function rateDefaultsFrom(rate, profile) {
  const r = rate || {};
  return {
    rc_ep_price: r.rc_ep_price ?? "",
    rc_spot_lift_price: r.rc_spot_lift_price ?? "",
    rc_delivery_price: r.rc_delivery_price ?? "",
    rc_moisture_pct: r.rc_moisture_pct ?? "",
    rc_spot_lifting: !!r.rc_spot_lifting,
    rc_old_ep_price: r.rc_old_ep_price ?? "",
    rc_old_spot_lifting: !!r.rc_old_spot_lifting,
    ot_price: r.ot_price ?? "",
    ac_price: r.ac_price ?? "",
    ac_call_for_price: !!r.ac_call_for_price,
    ap_price: r.ap_price ?? "",
    rp_price: r.rp_price ?? "",
    pepper_price: r.pepper_price ?? "",
    pepper_call_for_price: !!r.pepper_call_for_price,
    cardamom_price: r.cardamom_price ?? "",
    spot_payment: !!r.spot_payment,
    payment_mode: r.payment_mode || "cash",
    commitment_time: r.commitment_time || "",
    valid_till: r.valid_till || "17:00",
    subject_to_reconfirmation: !!r.subject_to_reconfirmation,
    delivery_points: r.delivery_points || [],
    contact_1: { name: r.contact_1_name || profile?.owner_name || "", phone: r.contact_1_phone || profile?.phone || "" },
    contact_2: { name: r.contact_2_name || "", phone: r.contact_2_phone || "" },
    contact_3: { name: r.contact_3_name || "", phone: r.contact_3_phone || "" },
    notes: r.notes || "",
  };
}

export default function SignupMerchant({ resubmitMode = false, prefill = null, onAfterResubmit = null }) {
  const { t } = useTranslation();
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

  const rateDefaults = rateDefaultsFrom(prefill?.pending_rate, prefill);

  const { register, handleSubmit, watch, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(resubmitMode ? resubmitSchema : registerSchema),
    defaultValues: { ...profileDefaults, ...rateDefaults },
  });
  const desc = watch("businessDescription") || "";
  const cropsTraded = watch("cropsTraded") || [];
  const waSame = watch("whatsappSame");
  const dp = watch("delivery_points") || [];
  const acCFP = watch("ac_call_for_price");
  const pepCFP = watch("pepper_call_for_price");
  const spotPay = watch("spot_payment");
  const reconfirm = watch("subject_to_reconfirmation");

  function toggleCrop(c) {
    setValue("cropsTraded", cropsTraded.includes(c) ? cropsTraded.filter(x => x !== c) : [...cropsTraded, c], { shouldValidate: true });
  }
  function toggleDP(p) {
    setValue("delivery_points", dp.includes(p) ? dp.filter(x => x !== p) : [...dp, p]);
  }
  function setBoolField(key, val) {
    setValue(key, val, { shouldDirty: true });
    if (key === "ac_call_for_price" && val) setValue("ac_price", "", { shouldDirty: true, shouldValidate: true });
    if (key === "pepper_call_for_price" && val) setValue("pepper_price", "", { shouldDirty: true, shouldValidate: true });
  }
  function isDisabledByCFP(key) {
    if (key === "ac_price" && acCFP) return true;
    if (key === "pepper_price" && pepCFP) return true;
    return false;
  }

  async function onSubmit(values) {
    setTopError(null);
    const rateJson = buildRateJson(values);
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
          pending_rate: rateJson,
          rejection_reason: null,
          status: "PENDING",
          resubmitted_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("users").update(patch).eq("id", prefill.id).select();
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
      const profile = await signup.mutateAsync({
        ...values,
        whatsapp: values.whatsappSame ? values.phone : values.whatsapp,
      });
      const { error } = await supabase.from("users").update({ pending_rate: rateJson }).eq("id", profile.id);
      if (error) {
        // eslint-disable-next-line no-console
        console.warn("[signup] pending_rate write failed", error.message);
      }
      qc.invalidateQueries({ queryKey: qk.profile(profile.id) });
    } catch (e) {
      setTopError(e?.code || "auth.loginError");
    }
  }

  function renderRateField(field) {
    if (field.type === "boolean") {
      const value = watch(field.key);
      return (
        <div key={field.key}>
          <Toggle label={field.label} value={!!value} onChange={(v) => setBoolField(field.key, v)}/>
          {field.hint && <p className="text-[10px] text-gray-500 italic mt-0.5">{field.hint}</p>}
        </div>
      );
    }
    const disabled = isDisabledByCFP(field.key);
    const err = errors[field.key];
    const label = field.label + (field.optional ? " " + t("common.optional") : "");
    return (
      <Input
        key={field.key}
        label={label}
        type="number"
        inputMode="decimal"
        step={field.key === "rc_moisture_pct" ? "0.1" : undefined}
        placeholder={field.placeholder ? `e.g. ${field.placeholder}` : ""}
        disabled={disabled}
        className={disabled ? "bg-gray-50 text-gray-400" : ""}
        help={field.hint}
        {...register(field.key)}
        error={err && err.message !== "form.needOnePrice" ? t(err.message) : null}
      />
    );
  }

  const SECTION_TONE = {
    amber: "bg-amber-50/40 border-amber-200", orange: "bg-orange-50/40 border-orange-200",
    yellow: "bg-yellow-50/40 border-yellow-200", green: "bg-green-50/40 border-green-200",
    emerald: "bg-emerald-50/40 border-emerald-200", lime: "bg-lime-50/40 border-lime-200",
    red: "bg-red-50/40 border-red-200", purple: "bg-purple-50/40 border-purple-200",
  };

  const submitting = resubmitMode ? resubmitting : signup.isPending;

  return (
    <div className="flex flex-col flex-1 pb-8">
      <Header showBack/>
      <main className="px-5 py-5 flex-1">
        <div className="text-center mb-5">
          <h2 className="text-2xl font-extrabold text-gray-900">
            {resubmitMode ? t("pending.resubmitTitle") : t("auth.merchantSignup")}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {resubmitMode ? t("pending.resubmitSub") : t("auth.merchantSignupSub")}
          </p>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Input label={t("auth.businessName")} {...register("businessName")} error={errors.businessName ? t(errors.businessName.message) : null}/>
          <Input label={t("auth.ownerName")}    {...register("ownerName")}    error={errors.ownerName ? t(errors.ownerName.message) : null}/>
          <Input label={t("auth.phone")} type="tel" placeholder="98XXXXXXXX" {...register("phone")} error={errors.phone ? t(errors.phone.message) : null}/>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-semibold text-gray-700">{t("auth.whatsappNum")}</label>
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600">
                <input type="checkbox" {...register("whatsappSame")} className="h-4 w-4 accent-coorg-600"/>
                {t("auth.sameAsPhone")}
              </label>
            </div>
            <Input type="tel" disabled={waSame} placeholder="98XXXXXXXX" {...register("whatsapp")}
              error={errors.whatsapp && !waSame ? t(errors.whatsapp.message) : null}/>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input label={t("auth.town")} {...register("town")} error={errors.town ? t(errors.town.message) : null}/>
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
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t("auth.cropsTraded")}</label>
            <div className="flex flex-wrap gap-2">
              {CROPS_TRADED.map(c => {
                const active = cropsTraded.includes(c);
                return (
                  <button type="button" key={c} onClick={() => toggleCrop(c)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold border min-h-[36px] ${
                      active ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
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
              <Input label={t("auth.email")} type="email" autoComplete="email"
                {...register("email")} error={errors.email ? t(errors.email.message) : null}/>
              <Input label={t("auth.password")} type="password" autoComplete="new-password"
                {...register("password")} error={errors.password ? t(errors.password.message) : null}/>
            </>
          )}

          <div className="pt-2">
            <h3 className="text-lg font-extrabold text-gray-900">{t("form.todaysRates")}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{t("form.todaysRatesSub")}</p>
          </div>

          {COFFEE_SECTIONS.map(section => (
            <div key={section.key} className={`rounded-xl border-2 p-3 space-y-2 ${SECTION_TONE[section.color] || SECTION_TONE.amber}`}>
              <div className="text-sm font-extrabold text-coorg-800">{section.label}</div>
              {section.hint && <p className="text-[11px] text-gray-600 italic -mt-1">{section.hint}</p>}
              {section.fields.map(renderRateField)}
            </div>
          ))}

          <details className="rounded-xl border border-gray-200 p-3" open>
            <summary className="font-bold text-gray-800 cursor-pointer text-sm">{t("section.logistics")}</summary>
            <div className="mt-3 space-y-3">
              <Toggle label={t("form.spotPayment")} value={spotPay} onChange={v => setValue("spot_payment", v)}/>
              <Toggle label={t("form.subjectReconfirm")} value={reconfirm} onChange={v => setValue("subject_to_reconfirmation", v)}/>
              <Select label={t("form.paymentMode")} {...register("payment_mode")}>
                {PAYMENT_MODES.map(p => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
              </Select>
              <Input label={t("form.commitmentTime")} placeholder={t("form.commitmentPh")} {...register("commitment_time")}/>
              <Input label={t("form.validTill")} type="time" {...register("valid_till")}/>
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1.5">{t("form.deliveryPoints")}</label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_POINTS.map(p => {
                    const active = dp.includes(p);
                    return (
                      <button type="button" key={p} onClick={() => toggleDP(p)}
                        className={`rounded-full px-3 py-1.5 text-xs font-semibold border min-h-[36px] ${
                          active ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
                        }`}>{p}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>

          <div className="space-y-3">
            <div className="text-sm font-bold text-gray-800">{t("section.contacts")}</div>
            {[1, 2, 3].map(n => (
              <div key={n} className="rounded-xl border border-gray-200 p-3 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wide text-gray-600">#{n}</div>
                <Input placeholder={t("form.contactName")} {...register(`contact_${n}.name`)}/>
                <Input placeholder={t("form.contactPhone")} type="tel" {...register(`contact_${n}.phone`)}
                  error={errors[`contact_${n}`]?.phone ? t(errors[`contact_${n}`].phone.message) : null}/>
              </div>
            ))}
          </div>

          <Textarea label={t("form.notes")} rows={2} {...register("notes")}/>

          {errors.rc_ep_price && errors.rc_ep_price.message === "form.needOnePrice" && (
            <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">
              {t("form.needOnePrice")}
            </div>
          )}

          {topError && <div className="rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">{t(topError)}</div>}

          <Button type="submit" loading={submitting} className="w-full">
            {submitting ? t("common.loading") : (resubmitMode ? t("pending.resubmitBtn") : t("auth.register"))}
          </Button>
          {resubmitMode ? (
            <button type="button" onClick={() => onAfterResubmit?.()}
              className="block text-center text-sm text-gray-600 py-2 w-full">
              {t("common.cancel")}
            </button>
          ) : (
            <Link to="/login" className="block text-center text-sm text-coorg-700 font-semibold py-2">{t("nav.login")}</Link>
          )}
        </form>
      </main>
    </div>
  );
}

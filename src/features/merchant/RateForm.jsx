import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Input, Textarea, Select } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { COFFEE_SECTIONS, DELIVERY_POINTS, PAYMENT_MODES, phoneRegex } from "../../lib/constants";

// Empty string -> null; otherwise positive number (max 6 digits)
const opt = z.preprocess((v) => (v === "" || v == null ? null : Number(v)), z.number().positive().max(999999).nullable());
const optStr = z.string().optional();

const contactSchema = z.object({
  name: z.string().optional(),
  phone: z.string().optional().refine(v => !v || phoneRegex.test(v), { message: "auth.phoneInvalid" }),
});

const schema = z.object({
  // Robusta Cherry (New)
  rc_ep_price: opt,
  rc_spot_lift_price: opt,
  rc_delivery_price: opt,
  rc_moisture_pct: opt,
  rc_spot_lifting: z.boolean().default(false),
  // Robusta Cherry (Old stock)
  rc_old_ep_price: opt,
  rc_old_spot_lifting: z.boolean().default(false),
  // Outturn-based
  ot_price: opt,
  // Arabica Cherry
  ac_price: opt,
  ac_call_for_price: z.boolean().default(false),
  // Arabica Parchment
  ap_price: opt,
  // Robusta Parchment
  rp_price: opt,
  // Pepper
  pepper_price: opt,
  pepper_call_for_price: z.boolean().default(false),
  // Cardamom
  cardamom_price: opt,
  // Logistics
  spot_payment: z.boolean(),
  payment_mode: z.string(),
  commitment_time: optStr,
  valid_till: optStr,
  subject_to_reconfirmation: z.boolean(),
  delivery_points: z.array(z.string()),
  // Contacts
  contact_1: contactSchema, contact_2: contactSchema, contact_3: contactSchema,
  notes: optStr,
}).superRefine((v, ctx) => {
  // At least one price column OR "call for price" flag must be set.
  const anyPrice = [
    v.rc_ep_price, v.rc_spot_lift_price, v.rc_delivery_price,
    v.rc_old_ep_price,
    v.ot_price,
    v.ac_price, v.ap_price, v.rp_price,
    v.pepper_price, v.cardamom_price,
  ].some(x => x != null && x > 0);
  const anyCallForPrice = v.ac_call_for_price || v.pepper_call_for_price;
  if (!anyPrice && !anyCallForPrice) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "form.needOnePrice", path: ["rc_ep_price"] });
  }
});

// Short code shown alongside the full crop name in each step header.
const SECTION_CODE = { rc_new: "RC", rc_old: "RC", ot: "OT", ac: "AC", ap: "AP", rp: "RP" };

function fromLatest(latest, merchant) {
  if (!latest) return defaults(merchant);
  return {
    // RC New
    rc_ep_price:        latest.rc_ep_price        ?? "",
    rc_spot_lift_price: latest.rc_spot_lift_price ?? "",
    rc_delivery_price:  latest.rc_delivery_price  ?? "",
    rc_moisture_pct:    latest.rc_moisture_pct    ?? "",
    rc_spot_lifting:   !!latest.rc_spot_lifting,
    // RC Old
    rc_old_ep_price:     latest.rc_old_ep_price ?? "",
    rc_old_spot_lifting:!!latest.rc_old_spot_lifting,
    // OT
    ot_price:           latest.ot_price ?? "",
    // AC
    ac_price:           latest.ac_price ?? "",
    ac_call_for_price: !!latest.ac_call_for_price,
    // AP / RP
    ap_price:           latest.ap_price ?? "",
    rp_price:           latest.rp_price ?? "",
    // Pepper
    pepper_price:       latest.pepper_price ?? "",
    pepper_call_for_price:!!latest.pepper_call_for_price,
    // Cardamom
    cardamom_price:     latest.cardamom_price ?? "",
    // Logistics
    spot_payment:      !!latest.spot_payment,
    payment_mode:       latest.payment_mode || "cash",
    commitment_time:    latest.commitment_time || "",
    valid_till:         latest.valid_till || "17:00",
    subject_to_reconfirmation: !!latest.subject_to_reconfirmation,
    delivery_points:    latest.delivery_points || [],
    // Contacts
    contact_1: { name: latest.contact_1_name || merchant?.owner_name || "", phone: latest.contact_1_phone || merchant?.phone || "" },
    contact_2: { name: latest.contact_2_name || "", phone: latest.contact_2_phone || "" },
    contact_3: { name: latest.contact_3_name || "", phone: latest.contact_3_phone || "" },
    notes: latest.notes || "",
  };
}

function defaults(merchant) {
  return {
    rc_ep_price: "", rc_spot_lift_price: "", rc_delivery_price: "",
    rc_moisture_pct: "", rc_spot_lifting: false,
    rc_old_ep_price: "", rc_old_spot_lifting: false,
    ot_price: "",
    ac_price: "", ac_call_for_price: false,
    ap_price: "", rp_price: "",
    pepper_price: "", pepper_call_for_price: false,
    cardamom_price: "",
    spot_payment: false, payment_mode: "cash",
    commitment_time: "", valid_till: "17:00",
    subject_to_reconfirmation: false, delivery_points: [],
    contact_1: { name: merchant?.owner_name || "", phone: merchant?.phone || "" },
    contact_2: { name: "", phone: "" },
    contact_3: { name: "", phone: "" },
    notes: "",
  };
}

export function RateForm({ merchant, latest, onSubmit, submitting }) {
  const { t, i18n } = useTranslation();
  const knCls = i18n.language === "kn" ? "kn" : "";
  const { register, handleSubmit, watch, setValue, reset, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: fromLatest(latest, merchant),
  });

  // Re-hydrate when the latest row or merchant changes.
  useEffect(() => { reset(fromLatest(latest, merchant)); }, [latest?.id, merchant?.id]); // eslint-disable-line

  const sections = COFFEE_SECTIONS;
  const lastStep = sections.length;          // index of the final (details) step
  const totalSteps = sections.length + 1;
  const [step, setStep] = useState(0);
  const [logisticsOpen, setLogisticsOpen] = useState(false);

  const dp = watch("delivery_points") || [];
  const spotPay = watch("spot_payment");
  const reconfirm = watch("subject_to_reconfirmation");
  const acCFP = watch("ac_call_for_price");
  const pepCFP = watch("pepper_call_for_price");

  function toggleDP(p) {
    setValue("delivery_points", dp.includes(p) ? dp.filter(x => x !== p) : [...dp, p]);
  }

  function submit(values) {
    // The form keys are 1:1 with DB columns, so spread + map nested contacts.
    const row = {
      // RC New
      rc_ep_price: values.rc_ep_price,
      rc_spot_lift_price: values.rc_spot_lift_price,
      rc_delivery_price: values.rc_delivery_price,
      rc_moisture_pct: values.rc_moisture_pct,
      rc_spot_lifting: values.rc_spot_lifting,
      // RC Old
      rc_old_ep_price: values.rc_old_ep_price,
      rc_old_spot_lifting: values.rc_old_spot_lifting,
      // OT
      ot_price: values.ot_price,
      // AC + flag
      ac_price: values.ac_call_for_price ? null : values.ac_price,
      ac_call_for_price: values.ac_call_for_price,
      // AP / RP
      ap_price: values.ap_price,
      rp_price: values.rp_price,
      // Pepper + flag
      pepper_price: values.pepper_call_for_price ? null : values.pepper_price,
      pepper_call_for_price: values.pepper_call_for_price,
      // Cardamom
      cardamom_price: values.cardamom_price,
      // Logistics
      spot_payment: values.spot_payment,
      payment_mode: values.payment_mode,
      commitment_time: values.commitment_time || null,
      valid_till: values.valid_till || null,
      subject_to_reconfirmation: values.subject_to_reconfirmation,
      delivery_points: values.delivery_points || [],
      // Contacts (flattened)
      contact_1_name:  values.contact_1?.name  || null,
      contact_1_phone: values.contact_1?.phone || null,
      contact_2_name:  values.contact_2?.name  || null,
      contact_2_phone: values.contact_2?.phone || null,
      contact_3_name:  values.contact_3?.name  || null,
      contact_3_phone: values.contact_3?.phone || null,
      notes: values.notes || null,
    };
    onSubmit(row);
  }

  // Decide whether a number-input field is disabled by a "call for price" sibling.
  function isDisabledByCallForPrice(fieldKey) {
    if (fieldKey === "ac_price"     && acCFP)  return true;
    if (fieldKey === "pepper_price" && pepCFP) return true;
    return false;
  }

  // Boolean toggle's onChange: for "call for price" toggles, also clear the partner price field.
  function setBoolField(fieldKey, value) {
    setValue(fieldKey, value, { shouldDirty: true });
    if (fieldKey === "ac_call_for_price" && value) {
      setValue("ac_price", "", { shouldDirty: true, shouldValidate: true });
    }
    if (fieldKey === "pepper_call_for_price" && value) {
      setValue("pepper_price", "", { shouldDirty: true, shouldValidate: true });
    }
  }

  function renderField(field) {
    if (field.type === "boolean") {
      const value = watch(field.key);
      return (
        <div key={field.key} className="pt-1">
          <YesNo label={field.label} value={!!value} onChange={(v) => setBoolField(field.key, v)} kn={knCls}/>
          {field.hint && <p className={`text-xs text-gray-500 mt-1 ${knCls}`}>{field.hint}</p>}
        </div>
      );
    }
    const disabled = isDisabledByCallForPrice(field.key);
    const err = errors[field.key];
    const label = field.label + (field.optional ? " " + t("common.optional") : "");
    return (
      <div key={field.key}>
        <Input
          label={label}
          type="number"
          inputMode="decimal"
          step={field.key === "rc_moisture_pct" ? "0.1" : undefined}
          placeholder={field.placeholder ? `e.g. ${field.placeholder}` : ""}
          disabled={disabled}
          className={disabled ? "bg-gray-50 text-gray-400" : ""}
          {...register(field.key)}
          error={err && err.message !== "form.needOnePrice" ? t(err.message) : null}
        />
        {field.hint && !disabled && <p className={`text-xs text-gray-500 mt-1 ${knCls}`}>{field.hint}</p>}
      </div>
    );
  }

  const current = sections[step];
  const stepTitle = step < sections.length
    ? `${current.label}${SECTION_CODE[current.key] ? ` (${SECTION_CODE[current.key]})` : ""}`
    : t("form.finishStep", "Delivery, payment and contacts");

  return (
    <form onSubmit={handleSubmit(submit)} className="space-y-5">
      {/* Progress indicator */}
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-gray-500">
          <span className={knCls}>{t("form.step", { defaultValue: "Step {{current}} of {{total}}", current: step + 1, total: totalSteps })}</span>
          <span className="tabular-nums">{Math.round(((step + 1) / totalSteps) * 100)}%</span>
        </div>
        <div className="mt-1.5 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className="h-full bg-coorg-600 transition-all" style={{ width: `${((step + 1) / totalSteps) * 100}%` }}/>
        </div>
        <h2 className={`mt-3 text-lg font-bold text-gray-900 ${knCls}`}>{stepTitle}</h2>
        {step < sections.length && (
          <p className={`text-xs text-gray-500 mt-1 ${knCls}`}>
            {current.hint || t("form.cropStepHelp", "Fill the prices you are offering today. Leave blank what you do not buy.")}
          </p>
        )}
      </div>

      {/* Crop steps: all mounted, only the active one is visible */}
      {sections.map((section, i) => (
        <div key={section.key} className={step === i ? "space-y-4" : "hidden"}>
          {section.fields.map(renderField)}
        </div>
      ))}

      {/* Final step: delivery + payment + contacts + notes */}
      <div className={step === lastStep ? "space-y-5" : "hidden"}>
        <div className="rounded-xl border-2 border-gray-200">
          <button type="button" onClick={() => setLogisticsOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 min-h-[48px] text-left font-semibold text-gray-800">
            <span className={knCls}>{t("form.deliveryPaymentDetails", "Delivery and Payment Details")}</span>
            <span className="text-sm text-coorg-700">{logisticsOpen ? t("common.hide", "Hide") : t("common.show", "Show")}</span>
          </button>
          {logisticsOpen && (
            <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-4">
              <YesNo label={t("form.spotPayment")} value={spotPay} onChange={v => setBoolField("spot_payment", v)} kn={knCls}/>
              <YesNo label={t("form.subjectReconfirm")} value={reconfirm} onChange={v => setBoolField("subject_to_reconfirmation", v)} kn={knCls}/>
              <Select label={t("form.paymentMode")} {...register("payment_mode")}>
                {PAYMENT_MODES.map(p => <option key={p.value} value={p.value}>{t(p.labelKey)}</option>)}
              </Select>
              <Input label={t("form.commitmentTime")} placeholder={t("form.commitmentPh")} {...register("commitment_time")}/>
              <Input label={t("form.validTill")} type="time" {...register("valid_till")}/>
              <div>
                <label className={`block text-sm font-semibold text-gray-700 mb-1.5 ${knCls}`}>{t("form.deliveryPoints")}</label>
                <div className="flex flex-wrap gap-2">
                  {DELIVERY_POINTS.map(p => {
                    const active = dp.includes(p);
                    return (
                      <button type="button" key={p} onClick={() => toggleDP(p)}
                        className={`rounded-full px-4 min-h-[48px] text-sm font-semibold border-2 ${
                          active ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
                        }`}>{p}</button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className={`text-base font-bold text-gray-900 ${knCls}`}>{t("form.contactsHeading", "Who should farmers call?")}</div>
          {[1, 2, 3].map(n => (
            <div key={n} className="rounded-xl border-2 border-gray-200 p-3 space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">{t("form.contactN", { defaultValue: "Contact {{n}}", n })}</div>
              <Input placeholder={t("form.contactName")} {...register(`contact_${n}.name`)}/>
              <Input placeholder={t("form.contactPhone")} type="tel" {...register(`contact_${n}.phone`)}
                error={errors[`contact_${n}`]?.phone ? t(errors[`contact_${n}`].phone.message) : null}/>
            </div>
          ))}
        </div>

        <Textarea label={t("form.notes")} rows={2} {...register("notes")}/>

        {errors.rc_ep_price && errors.rc_ep_price.message === "form.needOnePrice" && (
          <div className={`rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold ${knCls}`}>
            {t("form.needOnePrice")}
          </div>
        )}
      </div>

      {/* Step navigation */}
      {step < lastStep ? (
        <div className="grid grid-cols-2 gap-3">
          <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))} disabled={step === 0}
            className={`min-h-[48px] rounded-xl border-2 border-gray-200 text-gray-700 font-semibold disabled:opacity-40 ${knCls}`}>
            {t("common.back")}
          </button>
          <button type="button" onClick={() => setStep(s => Math.min(lastStep, s + 1))}
            className={`min-h-[48px] rounded-xl bg-coorg-600 text-white font-semibold hover:bg-coorg-700 ${knCls}`}>
            {t("form.next", "Next")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <Button type="submit" size="lg" loading={submitting} className="w-full">
            {submitting ? t("common.loading") : t("common.submit")}
          </Button>
          <button type="button" onClick={() => setStep(s => Math.max(0, s - 1))}
            className={`w-full min-h-[48px] rounded-xl border-2 border-gray-200 text-gray-700 font-semibold ${knCls}`}>
            {t("common.back")}
          </button>
        </div>
      )}
    </form>
  );
}

function YesNo({ label, value, onChange, kn }) {
  const { t } = useTranslation();
  return (
    <div>
      <div className={`text-sm font-semibold text-gray-700 mb-1.5 ${kn}`}>{label}</div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" onClick={() => onChange(false)}
          className={`min-h-[48px] rounded-xl border-2 font-semibold text-sm ${kn} ${
            !value ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
          }`}>
          {t("common.no")}
        </button>
        <button type="button" onClick={() => onChange(true)}
          className={`min-h-[48px] rounded-xl border-2 font-semibold text-sm ${kn} ${
            value ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
          }`}>
          {t("common.yes")}
        </button>
      </div>
    </div>
  );
}

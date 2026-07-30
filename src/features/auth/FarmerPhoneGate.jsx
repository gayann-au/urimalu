import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { PhoneField } from "../../components/ui/PhoneField";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { normalizePhone, isValidPhone, DEFAULT_PHONE_COUNTRY } from "../../lib/phone";
import { useAuth } from "./useAuth";

// Shown at app load to a logged-in farmer whose phone is missing or blank
// (whitespace only), an account created before the number was collected or one
// left blank by an older code path. It asks the farmer directly for their number
// and never guesses a value. Saving writes only the phone field on the farmer's
// own users row (the self-update RLS policy allows it), then refreshes the
// profile so profile.phone is set. The routes gate then stops rendering this
// screen, so the farmer is asked once and never again. Merchants and admins
// never reach this screen. This is the phone counterpart to FarmerNameGate,
// kept as a separate gate so the two concerns stay independent.

// Same country-aware check the signup form enforces, so a number accepted here
// is one the signup form would have accepted too, and one normalizePhone can
// always turn into an E.164 value.
const schema = z.object({
  phone: z.string(),
  phoneCountry: z.string().default("IN"),
}).superRefine((v, ctx) => {
  if (!isValidPhone(v.phone, v.phoneCountry))
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "auth.phoneInvalid", path: ["phone"] });
});

export default function FarmerPhoneGate() {
  const { profile, refetchProfile } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const { register, handleSubmit, formState: { errors } } = useForm({ resolver: zodResolver(schema), defaultValues: { phoneCountry: DEFAULT_PHONE_COUNTRY } });

  async function submit({ phone, phoneCountry }) {
    if (!profile) return;
    setBusy(true);
    setError(null);
    // Stored in E.164 form, the same shape every other phone write uses.
    const { error: updErr } = await supabase.from("users").update({ phone: normalizePhone(phone, phoneCountry) }).eq("id", profile.id);
    if (updErr) {
      setError("auth.phoneError");
      setBusy(false);
      return;
    }
    // Pull the fresh row so profile.phone is set and this gate clears. Also drop
    // any cached users list so admin views reflect the new number. busy stays
    // true through the refetch: once the number lands the gate unmounts, so
    // there is no need to flip it back off on the happy path.
    await refetchProfile();
    qc.invalidateQueries({ queryKey: qk.users });
  }

  return (
    <div className="flex flex-col flex-1 items-center isolate">
      <GlowBackdrop/>
      <Header/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
          <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-6 sm:m-4">
            <div className="text-center">
              <h3 className="font-display text-xl font-extrabold tracking-tight text-ink-900">{t("auth.phoneTitle")}</h3>
              <p className="text-sm text-ink-500 mt-1">{t("auth.phoneSubtitle")}</p>
            </div>
            <form onSubmit={handleSubmit(submit)} className="mt-4 space-y-3">
              {/* Validation errors sit on the field itself; a failed write shows
                  in the same slot, so there is only ever one message to read. */}
              <PhoneField
                label={t("auth.phone")}
                countryReg={register("phoneCountry")}
                numberReg={register("phone")}
                error={errors.phone ? t(errors.phone.message) : error ? t(error) : null}
              />
              <Button type="submit" loading={busy} className="w-full">{t("common.save")}</Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

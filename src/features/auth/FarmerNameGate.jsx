import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { Input } from "../../components/ui/Input";
import { Button } from "../../components/ui/Button";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "./useAuth";

// Shown at app load to a logged-in farmer whose full_name is missing or blank
// (whitespace only), an account created before the name was collected or one
// left with a blank name by an older code path. It asks the farmer directly
// for their name and never guesses a value. Saving writes only the full_name
// field on the farmer's own users row (the self-update RLS policy allows it),
// then refreshes the profile so profile.full_name is set. The routes gate then
// stops rendering this screen, so the farmer is asked once and never again.
// Merchants and admins never reach this screen. This is the full_name
// counterpart to FarmerDistrictGate, kept as a separate gate so the two
// concerns stay independent.

// Same trim-aware minimum the signup form enforces (z.string().trim().min(2)).
const MIN_NAME_LEN = 2;

export default function FarmerNameGate() {
  const { profile, refetchProfile } = useAuth();
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(e) {
    e.preventDefault();
    if (!profile) return;
    // Trim-aware minimum, the same rule the signup form enforces: a name of
    // only spaces is rejected here too, and the trimmed value is what we save.
    const trimmed = name.trim();
    if (trimmed.length < MIN_NAME_LEN) {
      setError("auth.nameTooShort");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: updErr } = await supabase.from("users").update({ full_name: trimmed }).eq("id", profile.id);
    if (updErr) {
      setError("auth.nameError");
      setBusy(false);
      return;
    }
    // Pull the fresh row so profile.full_name is set and this gate clears. Also
    // drop any cached users list so admin views reflect the new name. busy stays
    // true through the refetch: once the name lands the gate unmounts, so there
    // is no need to flip it back off on the happy path.
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
              <h3 className="font-display text-xl font-extrabold tracking-tight text-ink-900">{t("auth.nameTitle")}</h3>
              <p className="text-sm text-ink-500 mt-1">{t("auth.nameSubtitle")}</p>
            </div>
            <form onSubmit={submit} className="mt-4 space-y-3">
              <Input
                label={t("auth.fullName")}
                maxLength={100}
                autoFocus
                value={name}
                onChange={e => setName(e.target.value)}
                error={error ? t(error) : null}
              />
              <Button type="submit" loading={busy} className="w-full">{t("common.save")}</Button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";
import { useAuth } from "./useAuth";
import { DistrictPicker } from "./DistrictPicker";

// Shown at app load to a logged-in farmer whose district column is null, an
// account created before district was collected during signup. It asks the
// farmer directly for their district and never guesses a value. Saving writes
// only the district field on the farmer's own users row (the self-update RLS
// policy allows it), then refreshes the profile so profile.district is set. The
// routes gate then stops rendering this screen, so the farmer is asked once and
// never again. Merchants and admins never reach this screen.
export default function FarmerDistrictGate() {
  const { profile, refetchProfile } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function pickDistrict(d) {
    if (!profile) return;
    setBusy(true);
    setError(null);
    const { error: updErr } = await supabase.from("users").update({ district: d }).eq("id", profile.id);
    if (updErr) {
      setError("auth.districtError");
      setBusy(false);
      return;
    }
    // Pull the fresh row so profile.district is set and this gate clears. Also
    // drop any cached users list so admin views reflect the new district. busy
    // stays true through the refetch: once the district lands the gate unmounts,
    // so there is no need to flip it back off on the happy path.
    await refetchProfile();
    qc.invalidateQueries({ queryKey: qk.users });
  }

  return (
    <div className="flex flex-col flex-1 items-center isolate">
      <GlowBackdrop/>
      <Header/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <DistrictPicker onPick={pickDistrict} busy={busy} error={error} />
      </main>
    </div>
  );
}

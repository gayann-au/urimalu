import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../../components/ui/Button";
import { Input } from "../../components/ui/Input";
import { toast } from "../../components/ui/Toast";
import { useAuth } from "../auth/useAuth";
import { useMyCropFollows, useFollowCrop, useUnfollowCrop } from "./useCropFollows";
import { usePushRegistration } from "./usePushRegistration";

// Star button shown on crop cards and crop rows. Tapping it opens an inline
// bottom sheet where the user picks the alert type (any price change, or only
// when the price crosses a limit in rupees per kg) and saves. A filled amber
// star means the crop is followed; tapping again reopens the sheet to change
// settings or stop alerts. Hidden entirely for logged-out visitors: following
// requires an account for the alerts to belong to.
export function FollowCropButton({ cropName }) {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const followsQ = useMyCropFollows();
  const followCrop = useFollowCrop();
  const unfollowCrop = useUnfollowCrop();
  const { promptAfterFollow } = usePushRegistration();
  const [open, setOpen] = useState(false);
  const [alertType, setAlertType] = useState("any_change");
  const [threshold, setThreshold] = useState("");
  const [error, setError] = useState(null);

  if (!profile) return null;

  const existing = (followsQ.data || []).find((f) => f.crop_name === cropName);
  const isFollowed = !!existing;

  function openSheet() {
    setAlertType(existing?.alert_type || "any_change");
    setThreshold(existing?.threshold_value != null ? String(existing.threshold_value) : "");
    setError(null);
    setOpen(true);
  }

  async function save() {
    setError(null);
    const value = Number(threshold);
    if (alertType === "threshold" && (!threshold || isNaN(value) || value <= 0)) {
      setError("alerts.thresholdRequired");
      return;
    }
    try {
      await followCrop.mutateAsync({
        cropName,
        alertType,
        thresholdValue: alertType === "threshold" ? value : null,
      });
      toast({ tone: "ok", text: t("alerts.followed", { crop: cropName }) });
      setOpen(false);
      // Right after a follow saves, offer push (asks the browser once, ever).
      // Fire and forget: it never throws, and a denial leaves in-app alerts on.
      promptAfterFollow();
    } catch {
      setError("alerts.saveError");
    }
  }

  async function stopAlerts() {
    setError(null);
    try {
      await unfollowCrop.mutateAsync(cropName);
      toast({ text: t("alerts.unfollowed", { crop: cropName }) });
      setOpen(false);
    } catch {
      setError("alerts.saveError");
    }
  }

  const busy = followCrop.isPending || unfollowCrop.isPending;

  return (
    <>
      <button
        type="button"
        onClick={openSheet}
        aria-label={t("alerts.buttonLabel", { crop: cropName })}
        aria-pressed={isFollowed}
        className={`shrink-0 h-11 w-11 grid place-items-center rounded-2xl border-2 transition-colors ${
          isFollowed
            ? "border-amber-200 bg-amber-50 text-amber-500"
            : "border-ink-200 bg-white text-ink-400 hover:border-amber-300 hover:text-amber-500"
        }`}
      >
        <StarIcon filled={isFollowed}/>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-6 sm:m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-display text-xl font-extrabold tracking-tight text-ink-900 text-center">
              {t("alerts.sheetTitle", { crop: cropName })}
            </h3>

            <div className="mt-4 space-y-2">
              <OptionRow
                active={alertType === "any_change"}
                label={t("alerts.anyChange")}
                onClick={() => setAlertType("any_change")}
              />
              <OptionRow
                active={alertType === "threshold"}
                label={t("alerts.threshold")}
                onClick={() => setAlertType("threshold")}
              />
            </div>

            {alertType === "threshold" && (
              <div className="mt-3">
                <Input
                  label={t("alerts.thresholdLabel")}
                  type="number"
                  inputMode="decimal"
                  placeholder="320"
                  value={threshold}
                  onChange={(e) => setThreshold(e.target.value)}
                  help={t("alerts.thresholdHelp")}
                />
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold">
                {t(error)}
              </div>
            )}

            <div className="mt-5 space-y-2">
              <Button className="w-full" loading={busy} onClick={save}>
                {t("common.save")}
              </Button>
              {isFollowed && (
                <Button variant="dangerSoft" className="w-full" loading={busy} onClick={stopAlerts}>
                  {t("alerts.stopAlerts")}
                </Button>
              )}
              <button type="button" onClick={() => setOpen(false)}
                className="block text-center text-sm text-ink-600 py-2 w-full">
                {t("common.cancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Radio-style option row matching the district picker button styling.
function OptionRow({ active, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-[14px] border-2 py-3 px-4 text-left font-bold transition-colors ${
        active
          ? "border-coorg-600 bg-coorg-50 text-coorg-800"
          : "border-ink-200 text-ink-700 hover:border-coorg-300"
      }`}
    >
      {label}
    </button>
  );
}

function StarIcon({ filled }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
  );
}

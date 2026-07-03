import { useTranslation } from "react-i18next";
import { DISTRICTS } from "../../lib/constants";

// Shared district selection card, used in two places: the final step of farmer
// signup, and the app-load gate that asks an existing farmer whose district is
// missing. Presentational only: it renders the choices and reports the pick
// through onPick. The caller decides what saving a district means, passes a
// busy flag while its save runs, and passes an i18n error key to show on a
// failed save.
export function DistrictPicker({ onPick, busy = false, error = null }) {
  const { t } = useTranslation();
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-[430px] bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-6 sm:m-4">
        <div className="text-center">
          <h3 className="font-display text-xl font-extrabold tracking-tight text-ink-900">{t("auth.districtTitle")}</h3>
          <p className="text-sm text-ink-500 mt-1">{t("auth.districtSubtitle")}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {DISTRICTS.map(d => (
            <button key={d} type="button" disabled={busy} onClick={() => onPick(d)}
              className="rounded-[14px] border-2 border-coorg-200 hover:border-coorg-600 hover:bg-coorg-50 py-3 font-bold text-coorg-800 transition-colors disabled:opacity-60">
              {d}
            </button>
          ))}
        </div>
        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-700 px-3 py-2 text-sm font-semibold text-center">
            {t(error)}
          </div>
        )}
      </div>
    </div>
  );
}

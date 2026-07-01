import { useTranslation } from "react-i18next";

// Shown in place of a list when a read query fails, so a failed fetch surfaces a
// clear "couldn't load, try again" message instead of looking like an empty
// result. Mirrors the empty-state cards used across the app and adds a retry
// action so the user is never left at a silent dead end.
export function LoadError({ onRetry, className = "" }) {
  const { t } = useTranslation();
  return (
    <div className={`bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center ${className}`}>
      <p className="text-sm font-semibold text-ink-700">{t("common.loadError")}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 inline-flex min-h-[44px] items-center justify-center rounded-[14px] border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm px-5 hover:bg-coorg-50 transition-colors"
        >
          {t("common.retry")}
        </button>
      )}
    </div>
  );
}

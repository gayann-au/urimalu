import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { useAuth } from "../auth/useAuth";
import { useMyPriceHistory, groupHistoryByDate } from "./useMerchant";
import { formatINR } from "../../lib/constants";

export default function HistoryPage() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const { profile } = useAuth();
  const historyQ = useMyPriceHistory(profile?.id);
  const [expandedDate, setExpandedDate] = useState(null);

  const groups = useMemo(
    () => groupHistoryByDate(historyQ.data || []),
    [historyQ.data]
  );

  if (!profile) return null;

  function toggle(key) {
    setExpandedDate((d) => (d === key ? null : key));
  }

  return (
    <div className="flex flex-col flex-1 pb-8 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8">
      <Header showBack title={t("dashboard.priceHistory")}/>

      <main className="px-4 py-4">
        {historyQ.isLoading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse h-24"/>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-sm font-semibold text-gray-700">
              {t("history.noHistoryHeading")}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t("history.noHistoryBody")}
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {groups.map((g) => {
              const expanded = expandedDate === g.date_key;
              return (
                <li
                  key={g.date_key}
                  className="bg-white rounded-2xl border border-gray-200"
                >
                  <button
                    type="button"
                    onClick={() => toggle(g.date_key)}
                    className="w-full flex items-center justify-between px-4 py-4 text-left min-h-[64px]"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-gray-900">{g.date_label}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {g.crops.length === 1
                          ? t("history.cropConfirmedOne")
                          : t("history.cropConfirmedN", { count: g.crops.length })}
                      </div>
                    </div>
                    <span className="text-sm text-coorg-700 font-semibold ml-3 shrink-0">
                      {expanded ? t("common.hide") : t("common.show")}
                    </span>
                  </button>

                  {expanded && (
                    <ul className="border-t border-gray-100 divide-y divide-gray-100">
                      {g.crops.map((c) => (
                        <li key={c.id} className="px-4 py-3">
                          <div className="font-bold text-gray-900">{c.crop_name}</div>
                          {c.price == null ? (
                            <div className="mt-0.5 text-sm font-bold text-gray-700">
                              {t("card.callForPrice")}
                            </div>
                          ) : c.price_per_kg != null ? (
                            <div className="mt-0.5 text-sm font-bold text-coorg-700 tabular-nums">
                              {t("card.pricePerKg", { price: formatINR(c.price_per_kg) })}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-sm text-gray-700 tabular-nums">
                              {formatINR(c.price)}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={() => nav("/merchant/dashboard")}
          className="mt-6 w-full min-h-[48px] rounded-xl border-2 border-gray-200 text-gray-700 font-semibold text-sm"
        >
          {t("history.backToDashboard")}
        </button>
      </main>
    </div>
  );
}

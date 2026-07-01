import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { useAuth } from "../auth/useAuth";
import { useMyPriceHistory, groupHistoryByDate } from "./useMerchant";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import { formatINR } from "../../lib/constants";

export default function HistoryPage() {
  const { t } = useTranslation();
  const m = useUriMotion();
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
    <div className="flex flex-col flex-1 pb-10 w-full mx-auto max-w-3xl px-4 md:px-6">
      <Header showBack title={t("dashboard.priceHistory")}/>

      <main className="py-6">
        {historyQ.isError ? (
          <LoadError onRetry={() => historyQ.refetch()}/>
        ) : historyQ.isLoading ? (
          <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 animate-pulse h-24"/>
        ) : groups.length === 0 ? (
          <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center">
            <p className="text-sm font-semibold text-ink-700">
              {t("history.noHistoryHeading")}
            </p>
            <p className="text-xs text-ink-500 mt-1">
              {t("history.noHistoryBody")}
            </p>
          </div>
        ) : (
          <motion.ul variants={m.stagger} initial="hidden" animate="show" className="space-y-3">
            {groups.map((g) => {
              const expanded = expandedDate === g.date_key;
              return (
                <motion.li
                  key={g.date_key}
                  variants={m.fadeUp}
                  className="bg-white rounded-3xl border border-ink-200 shadow-sm overflow-hidden"
                >
                  <button
                    type="button"
                    onClick={() => toggle(g.date_key)}
                    className="w-full flex items-center justify-between px-5 py-4 text-left min-h-[64px]"
                  >
                    <div className="min-w-0">
                      <div className="font-bold text-ink-900">{g.date_label}</div>
                      <div className="text-xs text-ink-500 mt-0.5">
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
                    <ul className="border-t border-ink-100 divide-y divide-ink-100">
                      {g.crops.map((c) => (
                        <li key={c.id} className="px-5 py-3">
                          <div className="font-bold text-ink-900">{c.crop_name}</div>
                          {c.price == null ? (
                            <div className="mt-0.5 text-sm font-bold text-ink-700">
                              {t("card.callForPrice")}
                            </div>
                          ) : c.price_per_kg != null ? (
                            <div className="mt-0.5 text-sm font-bold text-coorg-700 tabular-nums">
                              {t("card.pricePerKg", { price: formatINR(c.price_per_kg) })}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-sm text-ink-700 tabular-nums">
                              {formatINR(c.price)}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </motion.li>
              );
            })}
          </motion.ul>
        )}

        <button
          type="button"
          onClick={() => nav("/merchant/dashboard")}
          className="mt-6 w-full min-h-[52px] rounded-[14px] border-2 border-ink-200 text-ink-700 font-bold text-sm hover:border-coorg-300 transition-colors"
        >
          {t("history.backToDashboard")}
        </button>
      </main>
    </div>
  );
}

import { useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { Badge } from "../../components/ui/Badge";
import { Stars } from "../../components/icons/Stars";
import { Button } from "../../components/ui/Button";
import { RateForm } from "./RateForm";
import { useAuth } from "../auth/useAuth";
import { useRates, useReviews } from "../feed/useFeed";
import { usePostRate, useDeleteRate } from "./useMerchant";
import { toast } from "../../components/ui/Toast";
import { latestRateByMerchant, getEffectiveStatus, formatINR, dayKey, lastNDays } from "../../lib/constants";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";
import { qk } from "../../lib/queryClient";

function useLeadsForMerchant(merchantId) {
  return useQuery({
    queryKey: qk.leadsByMerchant(merchantId),
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase.from("leads").select("*").eq("merchant_id", merchantId);
      if (error) throw error;
      return data || [];
    },
  });
}

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const knCls = i18n.language === "kn" ? "kn" : "";
  const locale = i18n.language === "kn" ? "kn-IN" : "en-IN";
  const { profile } = useAuth();
  const location = useLocation();
  const ratesQ = useRates();
  const reviewsQ = useReviews();
  const leadsQ = useLeadsForMerchant(profile?.id);
  const postRate = usePostRate(profile?.id);
  const delRate = useDeleteRate();
  const justWelcome = !!location.state?.welcome;

  const myRates   = useMemo(() => (ratesQ.data || []).filter(r => r.merchant_id === profile?.id), [ratesQ.data, profile?.id]);
  const myReviews = useMemo(() => (reviewsQ.data || []).filter(r => r.merchant_id === profile?.id), [reviewsQ.data, profile?.id]);
  const myLeads   = leadsQ.data || [];
  const latest    = useMemo(() => latestRateByMerchant(myRates)[0] || null, [myRates]);

  const showWelcome = justWelcome || myRates.length === 0;
  const [formOpen, setFormOpen] = useState(false);

  const last7 = lastNDays(7);
  const analytics = useMemo(() => {
    const totals = { VIEW: 0, SHOW_NUMBER: 0, WHATSAPP: 0, CALL: 0 };
    const perDay = Object.fromEntries(last7.map(k => [k, { day: k.slice(5), views: 0, show: 0, wa: 0, call: 0 }]));
    for (const l of myLeads) {
      const k = dayKey(l.created_at);
      if (perDay[k]) {
        if (l.type === "VIEW") perDay[k].views++;
        else if (l.type === "SHOW_NUMBER") perDay[k].show++;
        else if (l.type === "WHATSAPP") perDay[k].wa++;
        else if (l.type === "CALL") perDay[k].call++;
      }
      if (last7.includes(k)) totals[l.type] = (totals[l.type] || 0) + 1;
    }
    return { totals, perDay: last7.map(k => perDay[k]) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLeads]);

  const avg = myReviews.length
    ? Math.round((myReviews.reduce((a, r) => a + r.rating, 0) / myReviews.length) * 10) / 10
    : 0;

  if (!profile) return null;

  const eff = getEffectiveStatus(profile);
  const statusTone = eff === "APPROVED" ? "approved" : eff === "REJECTED" ? "rejected" : "pending";
  const statusLabel = eff === "APPROVED" ? t("common.verified")
    : eff === "REJECTED" ? t("admin.filter.rejected", "Rejected")
    : t("admin.filter.pending", "Pending");

  async function onSubmit(row) {
    try {
      await postRate.mutateAsync(row);
      toast({ tone: "ok", text: t("form.rateUpdated") });
      setFormOpen(false);
    } catch (e) {
      toast({ tone: "err", text: e.message || "Failed to post rate" });
    }
  }

  async function deleteRate(id) {
    if (!confirm(t("dashboard.deleteRate") + "?")) return;
    try { await delRate.mutateAsync(id); toast({ tone: "ok", text: t("dashboard.deleted", "Deleted") }); }
    catch (e) { toast({ tone: "err", text: e.message }); }
  }

  const recentRates = myRates.slice().sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at)).slice(0, 10);

  return (
    <div className="flex flex-col flex-1 pb-8">
      <Header/>

      {/* Top: identity, status, last posted */}
      <section className="px-4 py-5 border-b border-gray-100">
        <h1 className={`text-2xl font-bold text-gray-900 leading-tight ${knCls}`}>{profile.business_name}</h1>
        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <Badge tone={statusTone}><span className={knCls}>{statusLabel}</span></Badge>
          <span className={`text-sm text-gray-500 ${knCls}`}>
            {latest
              ? `${t("dashboard.lastPosted", "Last rate posted")}: ${new Date(latest.posted_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}`
              : t("dashboard.noRatesYet")}
          </span>
        </div>
      </section>

      {/* Stats */}
      <section className="px-4 pt-5">
        <h2 className={`text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 ${knCls}`}>{t("dashboard.analytics")}</h2>
        <div className="grid grid-cols-3 gap-3">
          <Stat label={t("dashboard.views")} value={analytics.totals.VIEW}/>
          <Stat label={t("dashboard.calls")} value={analytics.totals.CALL}/>
          <Stat label={t("dashboard.wa")}    value={analytics.totals.WHATSAPP}/>
        </div>
      </section>

      {/* Update rate CTA + form */}
      <section className="px-4 pt-6">
        {!formOpen ? (
          <>
            <Button size="lg" className="w-full" onClick={() => setFormOpen(true)}>
              <span className={knCls}>{t("dashboard.updateRate", "Update Today's Rate")}</span>
            </Button>
            {showWelcome && <p className={`text-sm text-gray-500 mt-2 text-center ${knCls}`}>{t("welcome.postFirst")}</p>}
          </>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className={`text-base font-bold text-gray-900 ${knCls}`}>{t("form.postRate")}</h2>
              <button type="button" onClick={() => setFormOpen(false)} className={`text-sm text-gray-500 underline ${knCls}`}>
                {t("common.cancel")}
              </button>
            </div>
            <RateForm merchant={profile} latest={latest} onSubmit={onSubmit} submitting={postRate.isPending}/>
          </div>
        )}
      </section>

      {/* Recent rates */}
      <section className="px-4 pt-8">
        <h2 className={`text-sm font-bold uppercase tracking-wide text-gray-500 mb-3 ${knCls}`}>{t("dashboard.ratesHistory")}</h2>
        {recentRates.length === 0 ? (
          <div className={`bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500 ${knCls}`}>{t("dashboard.noRatesYet")}</div>
        ) : (
          <ul className="space-y-2">
            {recentRates.map(r => (
              <li key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className={`text-sm font-semibold text-gray-900 ${knCls}`}>{summarize(r, t)}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(r.posted_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</div>
                </div>
                <button onClick={() => deleteRate(r.id)} className={`shrink-0 min-h-[48px] px-2 text-sm font-semibold text-red-600 ${knCls}`}>
                  {t("dashboard.deleteRate")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Reviews */}
      <section className="px-4 pt-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className={`text-sm font-bold uppercase tracking-wide text-gray-500 ${knCls}`}>{t("dashboard.myReviews")} ({myReviews.length})</h2>
          {myReviews.length > 0 && (
            <div className="flex items-center gap-1.5">
              <Stars value={avg} size={15}/>
              <span className="text-sm font-bold text-gray-700 tabular-nums">{avg.toFixed(1)}</span>
            </div>
          )}
        </div>
        {myReviews.length === 0 ? (
          <div className={`bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500 ${knCls}`}>{t("review.noneYet")}</div>
        ) : (
          <ul className="space-y-2">
            {myReviews.map(r => (
              <li key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-gray-900 text-sm">{r.author_name}</div>
                  <Stars value={r.rating} size={14}/>
                </div>
                {r.comment && <p className="mt-1 text-sm text-gray-700">{r.comment}</p>}
                <div className="text-xs text-gray-400 mt-2">{new Date(r.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 text-center">
      <div className="text-3xl font-extrabold text-coorg-700 tabular-nums">{value}</div>
      <div className="text-xs text-gray-500 font-semibold mt-1 leading-tight">{label}</div>
    </div>
  );
}

function summarize(r, t) {
  const parts = [];
  if (r.rc_ep_price != null)    parts.push(`${t("section.rc")} ${formatINR(r.rc_ep_price)}${t("card.perKg")}`);
  if (r.ac_price != null)       parts.push(`${t("section.ac")} ${formatINR(r.ac_price)}${t("card.perBag")}`);
  if (r.ap_price != null)       parts.push(`${t("section.ap")} ${formatINR(r.ap_price)}${t("card.perQuintal")}`);
  if (r.rp_price != null)       parts.push(`${t("section.rp")} ${formatINR(r.rp_price)}${t("card.perQuintal")}`);
  if (r.ot_price != null)       parts.push(`${t("section.ot")} ${formatINR(r.ot_price)}${t("card.perKg")}`);
  if (r.pepper_price != null)   parts.push(`${t("section.pepper")} ${formatINR(r.pepper_price)}${t("card.perKg")}`);
  if (r.cardamom_price != null) parts.push(`${t("section.cardamom")} ${formatINR(r.cardamom_price)}${t("card.perKg")}`);
  return parts.length ? parts.join(", ") : "-";
}

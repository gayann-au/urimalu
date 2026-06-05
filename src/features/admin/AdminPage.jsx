import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { format } from "date-fns";
import { Header } from "../../components/layout/Header";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { useUsers, useRates, useReviews } from "../feed/useFeed";
import { useAllLeads, useSetMerchantStatus, useRemoveUser, useRemoveRate, useRemoveReview } from "./useAdmin";
import { useReports, useUpdateReportStatus, useToggleMerchantDisabled } from "./useReports";
import { toast } from "../../components/ui/Toast";
import { getEffectiveStatus, pendingMsLeft, formatDuration, dayKey, lastNDays, formatINR } from "../../lib/constants";

const TABS = ["merchants", "farmers", "rates", "reviews", "reports", "analytics"];

export default function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("merchants");
  const { data: openReports = [] } = useReports();
  const openCount = openReports.length;
  return (
    <div className="flex flex-col flex-1 pb-8">
      <Header title={t("admin.title")}/>
      <nav className="bg-white border-b border-gray-100 sticky top-[64px] z-20">
        <div className="flex overflow-x-auto no-scrollbar">
          {TABS.map(k => {
            const label = k === "reports"
              ? `${t("report.openReports")}${openCount > 0 ? ` (${openCount})` : ""}`
              : t(`admin.tabs.${k}`);
            return (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 min-w-max px-3 py-3 text-xs font-bold uppercase tracking-wide border-b-2 ${
                  tab === k ? "border-coorg-600 text-coorg-700" : "border-transparent text-gray-500"
                }`}>
                {label}
              </button>
            );
          })}
        </div>
      </nav>
      <main className="px-3 py-4">
        {tab === "merchants" && <MerchantsTab/>}
        {tab === "farmers"   && <FarmersTab/>}
        {tab === "rates"     && <RatesTab/>}
        {tab === "reviews"   && <ReviewsTab/>}
        {tab === "reports"   && <ReportsTab/>}
        {tab === "analytics" && <AnalyticsTab/>}
      </main>
    </div>
  );
}

function StatusBadge({ status, isAuto }) {
  const tone = status === "APPROVED" ? "approved" : status === "REJECTED" ? "rejected" : "pending";
  return <Badge tone={tone}>{isAuto ? "Auto-approved" : status}</Badge>;
}

function MerchantsTab() {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const setStatus = useSetMerchantStatus();
  const removeUser = useRemoveUser();
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [showRatesFor, setShowRatesFor] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const merchants = useMemo(
    () => users.filter(u => u.role === "MERCHANT").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [users]
  );
  const list = useMemo(() => merchants.filter(m => {
    if (filter === "all") return true;
    return getEffectiveStatus(m) === filter.toUpperCase();
  }), [merchants, filter]);

  async function act(name, fn, okKey) {
    setBusyId(name);
    try { await fn(); toast({ tone: "ok", text: t(okKey, { name }) }); }
    catch (e) { toast({ tone: "err", text: e.message?.startsWith("admin.") ? t(e.message) : e.message || "Error" }); }
    finally { setBusyId(null); }
  }

  return (
    <>
      <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
        {["all", "pending", "approved", "rejected"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold border min-h-[36px] ${
              filter === f ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
            }`}>
            {t(`admin.filter.${f}`)}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty text={t("admin.noMerchants")}/>
      ) : (
        <ul className="space-y-2">
          {list.map(m => {
            const status = getEffectiveStatus(m);
            const isAuto = m.status === "PENDING" && status === "APPROVED";
            const ms = pendingMsLeft(m);
            const inflight = busyId === m.business_name;
            return (
              <li key={m.id} className="bg-white rounded-2xl border border-gray-100 p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 truncate">{m.business_name}</div>
                    <div className="text-xs text-gray-500">{m.owner_name}, {m.town}, {m.district}</div>
                    <div className="text-xs text-gray-500">{m.email}, {m.phone}</div>
                    <div className="text-[10px] text-gray-400 mt-1">{t("admin.signupDate")}: {format(new Date(m.created_at), "d MMM yyyy, h:mm a")}</div>
                  </div>
                  <StatusBadge status={status} isAuto={isAuto}/>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {m.years_trading   && <div><span className="text-gray-500">{t("auth.yearsTrading")}:</span> <span className="font-semibold">{t(`years.${m.years_trading}`, m.years_trading)}</span></div>}
                  {m.business_type   && <div><span className="text-gray-500">{t("auth.businessType")}:</span> <span className="font-semibold">{t(`bizType.${m.business_type}`, m.business_type)}</span></div>}
                  {m.crops_traded?.length > 0 && <div className="col-span-2"><span className="text-gray-500">{t("auth.cropsTraded")}:</span> <span className="font-semibold">{m.crops_traded.join(", ")}</span></div>}
                </div>
                {m.business_description && <p className="mt-1.5 text-[11px] text-gray-700 italic bg-gray-50 rounded-md px-2 py-1.5 border border-gray-100">"{m.business_description}"</p>}
                {status === "PENDING" && (
                  <div className="mt-2 text-xs text-amber-700 font-semibold">{t("pending.autoApprove")}: <span className="tabular-nums">{formatDuration(ms)}</span></div>
                )}

                {status === "PENDING" && (
                  <div className="mt-2">
                    <button type="button"
                      onClick={() => setShowRatesFor(showRatesFor === m.id ? null : m.id)}
                      className="text-xs font-semibold text-coorg-700 underline">
                      {showRatesFor === m.id ? t("admin.hideRates") : t("admin.viewRates")}
                    </button>
                    {showRatesFor === m.id && (
                      <PendingRatePreview rate={m.pending_rate}/>
                    )}
                  </div>
                )}

                {rejectingId === m.id ? (
                  <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <label className="block text-xs font-semibold text-amber-900">{t("admin.rejectReasonLabel")}</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      minLength={20}
                      placeholder={t("admin.rejectReasonPh")}
                      className="w-full rounded-lg border border-amber-300 bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                    <div className="text-[11px] text-amber-800 tabular-nums">
                      {rejectReason.trim().length}/20
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="subtle" className="flex-1"
                        onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                        {t("common.cancel")}
                      </Button>
                      <Button size="sm" variant="amber" className="flex-1"
                        loading={inflight}
                        disabled={rejectReason.trim().length < 20}
                        onClick={() => {
                          const reason = rejectReason.trim();
                          act(m.business_name,
                            () => setStatus.mutateAsync({ userId: m.id, status: "REJECTED", reason }),
                            "admin.rejectedToast");
                          setRejectingId(null);
                          setRejectReason("");
                        }}>
                        {t("admin.confirmReject")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex gap-2">
                    {status !== "APPROVED" && (
                      <Button size="sm" variant="emerald" loading={inflight} className="flex-1"
                        onClick={() => act(m.business_name, () => setStatus.mutateAsync({ userId: m.id, status: "APPROVED" }), "admin.approvedToast")}>
                        {t("admin.approve")}
                      </Button>
                    )}
                    {status !== "REJECTED" && (
                      <Button size="sm" variant="amber" loading={inflight} className="flex-1"
                        onClick={() => { setRejectingId(m.id); setRejectReason(""); }}>
                        {t("admin.reject")}
                      </Button>
                    )}
                    <Button size="sm" variant="danger" loading={inflight}
                      onClick={() => {
                        if (!confirm(t("admin.confirmRemove"))) return;
                        act(m.business_name, () => removeUser.mutateAsync(m.id), "admin.removedToast");
                      }}>
                      {t("admin.remove")}
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function FarmersTab() {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const removeUser = useRemoveUser();
  const farmers = users.filter(u => u.role === "FARMER").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (farmers.length === 0) return <Empty text={t("admin.noFarmers")}/>;
  return (
    <ul className="space-y-2">
      {farmers.map(f => (
        <li key={f.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="font-bold text-gray-900 truncate">{f.full_name || "(no name)"}</div>
            <div className="text-xs text-gray-500">{f.phone}, {f.district || "-"}</div>
            <div className="text-xs text-gray-500 truncate">{f.email}</div>
            <div className="text-[10px] text-gray-400 mt-1">{t("admin.signupDate")}: {format(new Date(f.created_at), "d MMM yyyy")}</div>
          </div>
          <Button size="sm" variant="danger" onClick={async () => {
            if (!confirm(t("admin.confirmRemove"))) return;
            try { await removeUser.mutateAsync(f.id); toast({ text: `Removed ${f.full_name}` }); }
            catch (e) { toast({ tone: "err", text: e.message?.startsWith("admin.") ? t(e.message) : e.message }); }
          }}>{t("admin.remove")}</Button>
        </li>
      ))}
    </ul>
  );
}

function RatesTab() {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const { data: rates = [] } = useRates();
  const removeRate = useRemoveRate();
  const byId = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  if (rates.length === 0) return <Empty text={t("admin.noRates")}/>;
  return (
    <ul className="space-y-2">
      {rates.map(r => (
        <li key={r.id} className="bg-white rounded-2xl border border-gray-100 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="font-bold text-gray-900 truncate">{byId.get(r.merchant_id)?.business_name || "(unknown)"}</div>
              <div className="text-sm font-semibold mt-1">{rateSummary(r)}</div>
              <div className="text-[10px] text-gray-400 mt-1">{format(new Date(r.posted_at), "d MMM yyyy, h:mm a")}</div>
            </div>
          </div>
          <Button size="sm" variant="danger" className="mt-3 w-full" onClick={async () => {
            if (!confirm(t("admin.confirmRemove"))) return;
            try { await removeRate.mutateAsync(r.id); toast({ text: "Removed" }); }
            catch (e) { toast({ tone: "err", text: e.message }); }
          }}>{t("admin.remove")}</Button>
        </li>
      ))}
    </ul>
  );
}

function ReviewsTab() {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const { data: reviews = [] } = useReviews();
  const removeReview = useRemoveReview();
  const byId = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  if (reviews.length === 0) return <Empty text={t("admin.noReviews")}/>;
  return (
    <ul className="space-y-2">
      {reviews.map(r => (
        <li key={r.id} className="bg-white rounded-2xl border border-gray-100 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-gray-900">{r.author_name}</div>
              <div className="text-xs text-gray-500">{byId.get(r.merchant_id)?.business_name || "(unknown)"}</div>
              <div className="text-xs font-bold text-amber-600 mt-0.5">{r.rating}/5</div>
              {r.comment && <p className="text-sm text-gray-700 mt-1">{r.comment}</p>}
              <div className="text-[10px] text-gray-400 mt-1">{format(new Date(r.created_at), "d MMM yyyy")}</div>
            </div>
            {r.flagged && <Badge tone="rejected">Flagged</Badge>}
          </div>
          <Button size="sm" variant="danger" className="mt-3 w-full" onClick={async () => {
            if (!confirm(t("admin.confirmRemove"))) return;
            try { await removeReview.mutateAsync(r.id); toast({ text: "Removed" }); }
            catch (e) { toast({ tone: "err", text: e.message }); }
          }}>{t("admin.remove")}</Button>
        </li>
      ))}
    </ul>
  );
}

function ReportsTab() {
  const { t } = useTranslation();
  const { data: reports = [], isLoading } = useReports();
  const { data: users = [] } = useUsers();
  const updateStatus = useUpdateReportStatus();
  const toggleDisabled = useToggleMerchantDisabled();
  const [busyId, setBusyId] = useState(null);

  const disabledMerchants = useMemo(
    () => users.filter(u => u.role === "MERCHANT" && u.is_disabled === true),
    [users]
  );

  async function dismiss(report) {
    setBusyId(report.id);
    try {
      await updateStatus.mutateAsync({ id: report.id, status: "DISMISSED" });
      toast({ text: "Dismissed" });
    } catch (e) {
      toast({ tone: "err", text: e.message || "Error" });
    } finally {
      setBusyId(null);
    }
  }

  async function disableMerchant(report) {
    setBusyId(report.id);
    try {
      await toggleDisabled.mutateAsync({ userId: report.merchant_id, isDisabled: true });
      await updateStatus.mutateAsync({ id: report.id, status: "REVIEWED" });
      toast({ text: "Merchant disabled" });
    } catch (e) {
      toast({ tone: "err", text: e.message?.startsWith("admin.") ? e.message : (e.message || "Error") });
    } finally {
      setBusyId(null);
    }
  }

  async function reenable(merchant) {
    setBusyId(merchant.id);
    try {
      await toggleDisabled.mutateAsync({ userId: merchant.id, isDisabled: false });
      toast({ text: `Re-enabled ${merchant.business_name}` });
    } catch (e) {
      toast({ tone: "err", text: e.message?.startsWith("admin.") ? e.message : (e.message || "Error") });
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-2">{t("report.openReports")}</div>
      {isLoading ? (
        <div className="bg-white rounded-2xl border border-gray-100 p-4 animate-pulse h-24"/>
      ) : reports.length === 0 ? (
        <Empty text="-"/>
      ) : (
        <ul className="space-y-2">
          {reports.map(r => {
            const inflight = busyId === r.id;
            return (
              <li key={r.id} className="bg-white rounded-2xl border border-gray-100 p-3">
                <div className="font-bold text-gray-900 truncate">{r.merchant?.business_name || "(unknown)"}</div>
                <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">{r.reason}</p>
                <div className="text-[10px] text-gray-400 mt-1">{format(new Date(r.created_at), "d MMM yyyy, h:mm a")}</div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" variant="subtle" loading={inflight} className="flex-1"
                    onClick={() => dismiss(r)}>
                    {t("report.dismiss")}
                  </Button>
                  <Button size="sm" variant="danger" loading={inflight} className="flex-1"
                    onClick={() => disableMerchant(r)}>
                    {t("report.disableMerchant")}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-gray-500 mt-6 mb-2">{t("report.disabledMerchants")}</div>
      {disabledMerchants.length === 0 ? (
        <Empty text="-"/>
      ) : (
        <ul className="space-y-2">
          {disabledMerchants.map(m => {
            const inflight = busyId === m.id;
            return (
              <li key={m.id} className="bg-white rounded-2xl border border-gray-100 p-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-bold text-gray-900 truncate">{m.business_name}</div>
                  <div className="text-xs text-gray-500 truncate">{m.owner_name}, {m.email}</div>
                </div>
                <Button size="sm" variant="emerald" loading={inflight} onClick={() => reenable(m)}>
                  {t("report.reenable")}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function AnalyticsTab() {
  const { t } = useTranslation();
  const { data: users = [] } = useUsers();
  const { data: rates = [] } = useRates();
  const { data: leads = [] } = useAllLeads();

  const farmers = users.filter(u => u.role === "FARMER");
  const merchants = users.filter(u => u.role === "MERCHANT");
  const today = dayKey(Date.now());
  const ratesToday = rates.filter(r => dayKey(r.posted_at) === today).length;
  const showToday = leads.filter(l => l.type === "SHOW_NUMBER" && dayKey(l.created_at) === today).length;
  const waToday   = leads.filter(l => l.type === "WHATSAPP" && dayKey(l.created_at) === today).length;
  const last7 = lastNDays(7);

  const chart = useMemo(() => {
    const map = Object.fromEntries(last7.map(k => [k, { day: k.slice(5), farmers: 0, merchants: 0 }]));
    for (const u of users) {
      const k = dayKey(u.created_at);
      if (map[k]) {
        if (u.role === "FARMER") map[k].farmers++;
        if (u.role === "MERCHANT") map[k].merchants++;
      }
    }
    return last7.map(k => map[k]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users]);

  return (
    <>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <KPI label={t("admin.totalFarmers")}    value={farmers.length}/>
        <KPI label={t("admin.totalMerchants")}  value={merchants.length}/>
        <KPI label={t("admin.ratesToday")}      value={ratesToday}/>
        <KPI label={t("admin.showNumberToday")} value={showToday}/>
        <KPI label={t("admin.waToday")}         value={waToday}/>
      </div>
      <div className="bg-white rounded-2xl border border-gray-100 p-2 pt-4">
        <div className="text-xs font-semibold text-gray-700 mb-1 px-2">{t("admin.dailySignups")}</div>
        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart} margin={{ top: 5, right: 8, bottom: 0, left: -16 }}>
              <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={28}/>
              <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 11 }}/>
              <Bar dataKey="farmers"   stackId="s" fill="#1f7d44" name="Farmers"/>
              <Bar dataKey="merchants" stackId="s" fill="#60a5fa" name="Merchants" radius={[6,6,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </>
  );
}

function rateSummary(r) {
  const parts = [];
  if (r.rc_ep_price != null)    parts.push(`RC ${formatINR(r.rc_ep_price)}/kg`);
  if (r.ac_price != null)       parts.push(`AC ${formatINR(r.ac_price)}/bag`);
  if (r.ap_price != null)       parts.push(`AP ${formatINR(r.ap_price)}/q`);
  if (r.rp_price != null)       parts.push(`RP ${formatINR(r.rp_price)}/q`);
  if (r.ot_price != null)       parts.push(`OT ${formatINR(r.ot_price)}/kg`);
  if (r.pepper_price != null)   parts.push(`Pepper ${formatINR(r.pepper_price)}/kg`);
  if (r.cardamom_price != null) parts.push(`Cardamom ${formatINR(r.cardamom_price)}/kg`);
  return parts.length ? parts.join(", ") : "-";
}

function KPI({ label, value }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-3 text-center">
      <div className="text-2xl font-extrabold text-coorg-700 mt-0.5">{value}</div>
      <div className="text-[11px] text-gray-500 font-semibold mt-0.5 leading-tight">{label}</div>
    </div>
  );
}

function Empty({ text }) {
  return <div className="bg-white rounded-2xl border border-gray-100 p-8 text-center text-gray-500 italic">{text}</div>;
}

function PendingRatePreview({ rate }) {
  const { t } = useTranslation();
  if (!rate) {
    return <div className="mt-2 text-xs text-gray-500 italic">{t("admin.noRateSubmitted")}</div>;
  }
  const rows = [
    rate.rc_ep_price       != null && ["RC EP",         `${formatINR(rate.rc_ep_price)}/kg`],
    rate.rc_spot_lift_price!= null && ["RC Spot Lift",  `${formatINR(rate.rc_spot_lift_price)}/kg`],
    rate.rc_delivery_price != null && ["RC Delivery",   `${formatINR(rate.rc_delivery_price)}/kg`],
    rate.rc_moisture_pct   != null && ["Moisture",      `${rate.rc_moisture_pct}%`],
    rate.rc_old_ep_price   != null && ["RC Old EP",     `${formatINR(rate.rc_old_ep_price)}/kg`],
    rate.ot_price          != null && ["OT",            `${formatINR(rate.ot_price)}/kg`],
    rate.ac_call_for_price        && ["AC",             "Call for price"],
    rate.ac_price          != null && ["AC",            `${formatINR(rate.ac_price)}/bag`],
    rate.ap_price          != null && ["AP",            `${formatINR(rate.ap_price)}/q`],
    rate.rp_price          != null && ["RP",            `${formatINR(rate.rp_price)}/q`],
    rate.pepper_call_for_price    && ["Pepper",         "Call for price"],
    rate.pepper_price      != null && ["Pepper",        `${formatINR(rate.pepper_price)}/kg`],
    rate.cardamom_price    != null && ["Cardamom",      `${formatINR(rate.cardamom_price)}/kg`],
  ].filter(Boolean);
  return (
    <div className="mt-2 rounded-xl border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
      {rows.length === 0 ? (
        <div className="text-gray-500 italic">{t("admin.noRateSubmitted")}</div>
      ) : (
        <ul className="space-y-0.5">
          {rows.map(([label, value]) => (
            <li key={label} className="flex justify-between gap-2">
              <span className="text-gray-600">{label}</span>
              <span className="font-semibold text-gray-900 tabular-nums">{value}</span>
            </li>
          ))}
        </ul>
      )}
      {(rate.spot_payment || rate.subject_to_reconfirmation || (rate.delivery_points && rate.delivery_points.length > 0)) && (
        <div className="pt-1.5 mt-1.5 border-t border-gray-200 flex flex-wrap gap-1.5">
          {rate.spot_payment && <Badge tone="approved">Spot pay</Badge>}
          {rate.subject_to_reconfirmation && <Badge tone="purple">Reconfirm</Badge>}
          {(rate.delivery_points || []).map(dp => <Badge key={dp} tone="neutral">{dp}</Badge>)}
        </div>
      )}
      {rate.contact_1_name && (
        <div className="pt-1.5 mt-1.5 border-t border-gray-200 text-gray-700">
          <span className="font-semibold">Contact:</span> {rate.contact_1_name}{rate.contact_1_phone ? `, ${rate.contact_1_phone}` : ""}
        </div>
      )}
    </div>
  );
}
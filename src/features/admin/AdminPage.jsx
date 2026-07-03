import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { useUsers, useReviews } from "../feed/useFeed";
import { useSetMerchantStatus, useRemoveUser, useRemoveReview } from "./useAdmin";
import { useReports, useUpdateReportStatus, useToggleMerchantDisabled } from "./useReports";
import { useAllFeatureRequests, useUpdateFeatureRequestStatus } from "../feedback/useFeatureRequests";
import { toast } from "../../components/ui/Toast";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import { FEATURE_STATUSES } from "../../lib/constants";

const TABS = ["merchants", "farmers", "reviews", "reports", "requests"];

export default function AdminPage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState("merchants");
  const { data: openReports = [] } = useReports();
  const { data: users = [] } = useUsers();
  const openCount = openReports.length;
  // Count of merchants waiting on a review decision, surfaced as a badge so the
  // admin notices new signups and re-reviews without opening the tab. It reads
  // the same users query the merchants tab uses, so it is current on load and
  // on every refetch.
  const pendingCount = users.filter(u => u.role === "MERCHANT" && u.status === "PENDING").length;
  const tabCount = { merchants: pendingCount, reports: openCount };
  return (
    <div className="flex flex-col flex-1 pb-10 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8">
      <Header title={t("admin.title")}/>
      <nav className="bg-white border-b border-ink-100 sticky top-[64px] z-20">
        <div className="flex overflow-x-auto no-scrollbar">
          {TABS.map(k => {
            const label = k === "reports" ? t("report.openReports") : t(`admin.tabs.${k}`);
            const count = tabCount[k] || 0;
            return (
              <button key={k} onClick={() => setTab(k)}
                className={`flex-1 min-w-max px-4 py-3 text-xs font-bold uppercase tracking-wide border-b-2 transition-colors ${
                  tab === k ? "border-coorg-600 text-coorg-700" : "border-transparent text-ink-500 hover:text-ink-700"
                }`}>
                <span className="inline-flex items-center gap-1.5">
                  {label}
                  {count > 0 && (
                    <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-chilli-600 text-white text-[10px] font-bold leading-none">
                      {count}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
      <main className="py-5">
        {tab === "merchants" && <MerchantsTab/>}
        {tab === "farmers"   && <FarmersTab/>}
        {tab === "reviews"   && <ReviewsTab/>}
        {tab === "reports"   && <ReportsTab/>}
        {tab === "requests"  && <RequestsTab/>}
      </main>
    </div>
  );
}

// Clean status pill in the brand palette: soft tinted fill with same-hue text,
// consistent shape across every status. Replaces the old traffic-light badges.
function StatusPill({ status }) {
  const map = {
    APPROVED: "bg-crop-50 text-crop-700 border-crop-100",
    PENDING:  "bg-amber-50 text-amber-700 border-amber-100",
    REJECTED: "bg-chilli-50 text-chilli-700 border-chilli-100",
  };
  const cls = map[status] || "bg-paper-2 text-ink-600 border-ink-200";
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${cls}`}>
      {status}
    </span>
  );
}

function Tag({ tone = "neutral", children }) {
  const map = {
    flag:    "bg-chilli-50 text-chilli-700 border-chilli-100",
    neutral: "bg-paper-2 text-ink-600 border-ink-200",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${map[tone] || map.neutral}`}>
      {children}
    </span>
  );
}

const CARD = "bg-white rounded-2xl border border-ink-200 shadow-sm hover:shadow-md transition-shadow p-5";

function MerchantsTab() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const usersQ = useUsers();
  const users = usersQ.data || [];
  const setStatus = useSetMerchantStatus();
  const removeUser = useRemoveUser();
  const [filter, setFilter] = useState("all");
  const [busyId, setBusyId] = useState(null);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState("");

  const merchants = useMemo(
    () => users.filter(u => u.role === "MERCHANT").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)),
    [users]
  );
  const list = useMemo(() => merchants.filter(m => {
    if (filter === "all") return true;
    return m.status === filter.toUpperCase();
  }), [merchants, filter]);

  async function act(name, fn, okKey) {
    setBusyId(name);
    try { await fn(); toast({ tone: "ok", text: t(okKey, { name }) }); }
    catch (e) { toast({ tone: "err", text: e.message?.startsWith("admin.") ? t(e.message) : e.message || "Error" }); }
    finally { setBusyId(null); }
  }

  if (usersQ.isError) return <LoadError onRetry={() => usersQ.refetch()}/>;

  return (
    <>
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar">
        {["all", "pending", "approved", "rejected"].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-xs font-bold border-2 min-h-[36px] transition-colors ${
              filter === f ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-ink-700 border-ink-200 hover:border-coorg-300"
            }`}>
            {t(`admin.filter.${f}`)}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <Empty text={t("admin.noMerchants")}/>
      ) : (
        <motion.ul variants={m.stagger} initial="hidden" animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {list.map(mc => {
            const inflight = busyId === mc.business_name;
            return (
              <motion.li key={mc.id} variants={m.fadeUp} className={CARD}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-display text-lg font-extrabold tracking-tight text-ink-900 truncate">{mc.business_name}</div>
                    <div className="text-xs text-ink-500 mt-0.5 break-words">{mc.owner_name}, {mc.town}, {mc.district}</div>
                    <div className="text-xs text-ink-500 break-words">{mc.email}, {mc.phone}</div>
                    <div className="text-[11px] text-ink-400 mt-1.5">{t("admin.signupDate")}: {format(new Date(mc.created_at), "d MMM yyyy, h:mm a")}</div>
                  </div>
                  <StatusPill status={mc.status}/>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                  {mc.years_trading   && <div><span className="text-ink-500">{t("auth.yearsTrading")}:</span> <span className="font-semibold text-ink-800">{t(`years.${mc.years_trading}`, mc.years_trading)}</span></div>}
                  {mc.business_type   && <div><span className="text-ink-500">{t("auth.businessType")}:</span> <span className="font-semibold text-ink-800">{t(`bizType.${mc.business_type}`, mc.business_type)}</span></div>}
                  {mc.crops_traded?.length > 0 && <div className="col-span-2"><span className="text-ink-500">{t("auth.cropsTraded")}:</span> <span className="font-semibold text-ink-800">{mc.crops_traded.join(", ")}</span></div>}
                </div>
                {mc.business_description && <p className="mt-2 text-xs text-ink-700 italic bg-paper-2 rounded-xl px-3 py-2 border border-ink-100 break-words">"{mc.business_description}"</p>}

                {rejectingId === mc.id ? (
                  <div className="mt-4 rounded-xl border border-ink-200 bg-paper-2 p-3 space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wide text-ink-600">{t("admin.rejectReasonLabel")}</label>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      rows={3}
                      minLength={20}
                      maxLength={500}
                      placeholder={t("admin.rejectReasonPh")}
                      className="w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-crop-500"
                    />
                    <div className="text-[11px] text-ink-500 tabular-nums">
                      {rejectReason.trim().length}/20
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="neutral" className="flex-1"
                        onClick={() => { setRejectingId(null); setRejectReason(""); }}>
                        {t("common.cancel")}
                      </Button>
                      <Button size="sm" variant="chilli" className="flex-1"
                        loading={inflight}
                        disabled={rejectReason.trim().length < 20}
                        onClick={() => {
                          const reason = rejectReason.trim();
                          act(mc.business_name,
                            () => setStatus.mutateAsync({ userId: mc.id, status: "REJECTED", reason }),
                            "admin.rejectedToast");
                          setRejectingId(null);
                          setRejectReason("");
                        }}>
                        {t("admin.confirmReject")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-4 flex gap-2">
                    {mc.status !== "APPROVED" && (
                      <Button size="sm" variant="primary" loading={inflight} className="flex-1"
                        onClick={() => act(mc.business_name, () => setStatus.mutateAsync({ userId: mc.id, status: "APPROVED" }), "admin.approvedToast")}>
                        {t("admin.approve")}
                      </Button>
                    )}
                    {mc.status !== "REJECTED" && (
                      <Button size="sm" variant="neutral" loading={inflight} className="flex-1"
                        onClick={() => { setRejectingId(mc.id); setRejectReason(""); }}>
                        {t("admin.reject")}
                      </Button>
                    )}
                    <Button size="sm" variant="dangerSoft" loading={inflight}
                      onClick={() => {
                        if (!confirm(t("admin.confirmRemove"))) return;
                        act(mc.business_name, () => removeUser.mutateAsync(mc.id), "admin.removedToast");
                      }}>
                      {t("admin.remove")}
                    </Button>
                  </div>
                )}
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </>
  );
}

function FarmersTab() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const usersQ = useUsers();
  const users = usersQ.data || [];
  const removeUser = useRemoveUser();
  if (usersQ.isError) return <LoadError onRetry={() => usersQ.refetch()}/>;
  const farmers = users.filter(u => u.role === "FARMER").sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
  if (farmers.length === 0) return <Empty text={t("admin.noFarmers")}/>;
  return (
    <motion.ul variants={m.stagger} initial="hidden" animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {farmers.map(f => (
        <motion.li key={f.id} variants={m.fadeUp} className={`${CARD} flex items-start justify-between gap-3`}>
          <div className="min-w-0">
            <div className="font-display text-lg font-extrabold tracking-tight text-ink-900 truncate">{f.full_name || "(no name)"}</div>
            <div className="text-xs text-ink-500 break-words">{f.phone}, {f.district || "-"}</div>
            <div className="text-xs text-ink-500 truncate">{f.email}</div>
            <div className="text-[11px] text-ink-400 mt-1.5">{t("admin.signupDate")}: {format(new Date(f.created_at), "d MMM yyyy")}</div>
          </div>
          <Button size="sm" variant="dangerSoft" onClick={async () => {
            if (!confirm(t("admin.confirmRemove"))) return;
            try { await removeUser.mutateAsync(f.id); toast({ text: `Removed ${f.full_name}` }); }
            catch (e) { toast({ tone: "err", text: e.message?.startsWith("admin.") ? t(e.message) : e.message }); }
          }}>{t("admin.remove")}</Button>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function ReviewsTab() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const usersQ = useUsers();
  const reviewsQ = useReviews();
  const users = usersQ.data || [];
  const reviews = reviewsQ.data || [];
  const removeReview = useRemoveReview();
  const byId = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  if (usersQ.isError || reviewsQ.isError) return <LoadError onRetry={() => { usersQ.refetch(); reviewsQ.refetch(); }}/>;
  if (reviews.length === 0) return <Empty text={t("admin.noReviews")}/>;
  return (
    <motion.ul variants={m.stagger} initial="hidden" animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {reviews.map(r => (
        <motion.li key={r.id} variants={m.fadeUp} className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-display text-base font-extrabold tracking-tight text-ink-900 truncate">{r.author_name}</div>
              <div className="text-xs text-ink-500 truncate">{byId.get(r.merchant_id)?.business_name || "(unknown)"}</div>
              <div className="text-xs font-bold text-amber-600 mt-1">{r.rating}/5</div>
              {r.comment && <p className="text-sm text-ink-700 mt-1.5 break-words">{r.comment}</p>}
              <div className="text-[11px] text-ink-400 mt-1.5">{format(new Date(r.created_at), "d MMM yyyy")}</div>
            </div>
            {r.flagged && <Tag tone="flag">Flagged</Tag>}
          </div>
          <Button size="sm" variant="dangerSoft" className="mt-4 w-full" onClick={async () => {
            if (!confirm(t("admin.confirmRemove"))) return;
            try { await removeReview.mutateAsync(r.id); toast({ text: "Removed" }); }
            catch (e) { toast({ tone: "err", text: e.message }); }
          }}>{t("admin.remove")}</Button>
        </motion.li>
      ))}
    </motion.ul>
  );
}

function ReportsTab() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const reportsQ = useReports();
  const reports = reportsQ.data || [];
  const isLoading = reportsQ.isLoading;
  const usersQ = useUsers();
  const users = usersQ.data || [];
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
      <div className="text-xs font-bold uppercase tracking-wide text-ink-500 mb-3">{t("report.openReports")}</div>
      {reportsQ.isError ? (
        <LoadError onRetry={() => reportsQ.refetch()}/>
      ) : isLoading ? (
        <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-4 animate-pulse h-24"/>
      ) : reports.length === 0 ? (
        <Empty text="-"/>
      ) : (
        <motion.ul variants={m.stagger} initial="hidden" animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reports.map(r => {
            const inflight = busyId === r.id;
            return (
              <motion.li key={r.id} variants={m.fadeUp} className={CARD}>
                <div className="font-display text-lg font-extrabold tracking-tight text-ink-900 truncate">{r.merchant?.business_name || "(unknown)"}</div>
                <p className="mt-1.5 text-sm text-ink-700 whitespace-pre-wrap break-words">{r.reason}</p>
                <div className="text-[11px] text-ink-400 mt-1.5">{format(new Date(r.created_at), "d MMM yyyy, h:mm a")}</div>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="neutral" loading={inflight} className="flex-1"
                    onClick={() => dismiss(r)}>
                    {t("report.dismiss")}
                  </Button>
                  <Button size="sm" variant="dangerSoft" loading={inflight} className="flex-1"
                    onClick={() => disableMerchant(r)}>
                    {t("report.disableMerchant")}
                  </Button>
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}

      <div className="text-xs font-bold uppercase tracking-wide text-ink-500 mt-8 mb-3">{t("report.disabledMerchants")}</div>
      {disabledMerchants.length === 0 ? (
        <Empty text="-"/>
      ) : (
        <motion.ul variants={m.stagger} initial="hidden" animate="show"
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {disabledMerchants.map(mc => {
            const inflight = busyId === mc.id;
            return (
              <motion.li key={mc.id} variants={m.fadeUp} className={`${CARD} flex items-start justify-between gap-3`}>
                <div className="min-w-0">
                  <div className="font-display text-base font-extrabold tracking-tight text-ink-900 truncate">{mc.business_name}</div>
                  <div className="text-xs text-ink-500 truncate">{mc.owner_name}, {mc.email}</div>
                  <div className="mt-1.5"><Tag tone="neutral">Disabled</Tag></div>
                </div>
                <Button size="sm" variant="primary" loading={inflight} onClick={() => reenable(mc)}>
                  {t("report.reenable")}
                </Button>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </>
  );
}

// Admin review panel for feature requests. Lists every request newest first,
// showing category, title, description, submitter role, and current status, and
// lets the admin move a request between the lifecycle states. The status write
// is an UPDATE guarded by the feature_requests_admin_update RLS policy.
function RequestsTab() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const requestsQ = useAllFeatureRequests();
  const updateStatus = useUpdateFeatureRequestStatus();
  const [busyId, setBusyId] = useState(null);

  const requests = requestsQ.data || [];

  if (requestsQ.isError) return <LoadError onRetry={() => requestsQ.refetch()}/>;

  async function changeStatus(req, status) {
    if (status === req.status) return;
    setBusyId(req.id);
    try {
      await updateStatus.mutateAsync({ id: req.id, status });
      toast({ tone: "ok", text: t("admin.statusUpdated") });
    } catch (e) {
      toast({ tone: "err", text: e.message || "Error" });
    } finally {
      setBusyId(null);
    }
  }

  if (requestsQ.isLoading) {
    return <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-4 animate-pulse h-24"/>;
  }
  if (requests.length === 0) return <Empty text={t("admin.noRequests")}/>;

  return (
    <motion.ul variants={m.stagger} initial="hidden" animate="show"
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {requests.map(r => {
        const inflight = busyId === r.id;
        return (
          <motion.li key={r.id} variants={m.fadeUp} className={CARD}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11px] font-bold uppercase tracking-wide text-coorg-700">{r.category}</div>
                <div className="font-display text-base font-extrabold tracking-tight text-ink-900 mt-0.5 break-words">{r.title}</div>
                {/* Submitter name is read straight from the row (saved at submit
                    time), not joined from users, so it still shows after the
                    account is gone. A null user_id means the account was
                    deleted: note it quietly, not alarmingly. */}
                <div className="text-xs text-ink-500 mt-0.5 break-words">
                  {r.submitter_name || "-"}
                  {r.user_id === null && (
                    <span className="text-ink-400 font-medium"> ({t("admin.deletedUser")})</span>
                  )}
                </div>
              </div>
              <Tag tone="neutral">{r.role}</Tag>
            </div>
            <p className="mt-2 text-sm text-ink-700 whitespace-pre-wrap break-words">{r.description}</p>
            <div className="text-[11px] text-ink-400 mt-2">{format(new Date(r.created_at), "d MMM yyyy, h:mm a")}</div>
            <div className="mt-3">
              <label className="block text-[11px] font-bold uppercase tracking-wide text-ink-500 mb-1.5">{t("admin.requestStatus")}</label>
              <select
                value={r.status}
                disabled={inflight}
                onChange={(e) => changeStatus(r, e.target.value)}
                className="w-full rounded-xl border-2 border-ink-200 focus:border-coorg-500 outline-none px-3 py-2 text-sm bg-white"
              >
                {FEATURE_STATUSES.map(s => (
                  <option key={s} value={s}>{t(`feature.status${s}`, s)}</option>
                ))}
              </select>
            </div>
          </motion.li>
        );
      })}
    </motion.ul>
  );
}

function Empty({ text }) {
  return <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-8 text-center text-ink-500">{text}</div>;
}

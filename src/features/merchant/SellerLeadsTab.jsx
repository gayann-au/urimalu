import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import {
  useActiveSellerLeads,
  useMySellerLeadReads,
  useMarkSellerLeadRead,
} from "../sellerLeads/useSellerLeads";

// Seller Leads tab in the merchant dashboard: every active "Ready to Sell"
// notice, newest first. A lead is unread until this merchant has a row in
// seller_lead_reads for it; tapping the unread dot (or the card) writes that
// row, which clears the dot here and the tab badge in DashboardPage.
export function SellerLeadsTab({ merchantId }) {
  const { t, i18n } = useTranslation();
  const m = useUriMotion();
  const leadsQ = useActiveSellerLeads();
  const readsQ = useMySellerLeadReads(merchantId);
  const markRead = useMarkSellerLeadRead();

  const readIds = useMemo(
    () => new Set((readsQ.data || []).map((r) => r.seller_lead_id)),
    [readsQ.data]
  );
  const leads = leadsQ.data || [];
  const locale = i18n.language === "kn" ? "kn-IN" : "en-IN";

  function markLeadRead(leadId) {
    if (readIds.has(leadId)) return;
    markRead.mutate({ merchantId, sellerLeadId: leadId });
  }

  if (leadsQ.isError) {
    return <LoadError onRetry={() => leadsQ.refetch()}/>;
  }

  if (leadsQ.isLoading) {
    return <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 animate-pulse h-24"/>;
  }

  if (leads.length === 0) {
    return (
      <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center">
        <p className="text-sm font-semibold text-ink-700">{t("sellerLeads.emptyHeading")}</p>
        <p className="text-xs text-ink-500 mt-1">{t("sellerLeads.emptyBody")}</p>
      </div>
    );
  }

  return (
    <motion.ul variants={m.stagger} initial="hidden" animate="show" className="space-y-3">
      {leads.map((lead) => (
        <LeadCard
          key={lead.id}
          lead={lead}
          unread={!readIds.has(lead.id)}
          onMarkRead={() => markLeadRead(lead.id)}
          locale={locale}
          t={t}
          fadeUp={m.fadeUp}
        />
      ))}
    </motion.ul>
  );
}

function LeadCard({ lead, unread, onMarkRead, locale, t, fadeUp }) {
  const posted = new Date(lead.created_at).toLocaleDateString(locale, {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  function onCall() {
    onMarkRead();
    window.location.href = `tel:${lead.farmer_phone}`;
  }

  function onWa() {
    onMarkRead();
    const num = String(lead.farmer_phone).replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(t("sellerLeads.waMessage", { name: lead.farmer_name || "" }));
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
  }

  return (
    <motion.li
      variants={fadeUp}
      onClick={onMarkRead}
      className={`rounded-3xl border shadow-sm p-5 cursor-pointer ${
        unread ? "bg-coorg-50 border-coorg-200" : "bg-white border-ink-200"
      }`}
    >
      <div className="flex items-start gap-3">
        {unread && (
          <span
            className="mt-1.5 h-2.5 w-2.5 rounded-full bg-coorg-600 shrink-0"
            aria-label={t("sellerLeads.unread")}
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display font-extrabold text-base text-ink-900 truncate">
            {lead.farmer_name}
          </div>
          <p className="text-sm text-ink-700 mt-1 break-words">{lead.description}</p>
          <div className="mt-1.5 text-xs text-ink-500">{posted}</div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onCall}
          className="min-h-[48px] rounded-full border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm hover:bg-coorg-50 transition-colors"
        >
          {t("common.call")}
        </button>
        <button
          type="button"
          onClick={onWa}
          className="min-h-[48px] rounded-full bg-coorg-600 text-white font-bold text-sm shadow-sm hover:bg-coorg-700 transition-colors"
        >
          {t("common.whatsapp")}
        </button>
      </div>
    </motion.li>
  );
}

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { LoadError } from "../../components/ui/LoadError";
import { useMyNotifications, useMarkAllNotificationsRead } from "./useNotifications";
import { useUriMotion } from "../../lib/uiMotion";
import { formatINR } from "../../lib/constants";

// Price alerts have three shapes: a first price (no old value), a change (old
// and new), and a move to call-for-price (no new value). Lifted out of
// notificationText unchanged, so existing rows read exactly as before.
function priceAlertText(n, t) {
  const merchant = n.merchant_name || t("notif.aMerchant");
  if (n.new_price == null) {
    return t("notif.priceUpdated", { crop: n.crop_name, merchant });
  }
  if (n.old_price == null) {
    return t("notif.priceSet", { crop: n.crop_name, merchant, price: formatINR(n.new_price) });
  }
  return t("notif.priceChanged", {
    crop: n.crop_name,
    merchant,
    price: formatINR(n.new_price),
    old: formatINR(n.old_price),
  });
}

// Build the sentence for one notification from its raw facts, in the reader's
// current language. Every value notifications_type_chk allows gets an explicit
// branch, and anything else falls to a generic sentence. The default matters:
// this function previously treated "not seller_lead" as "price alert", so a
// type added to the database ahead of the client rendered as a malformed price
// sentence rather than failing visibly.
function notificationText(n, t) {
  switch (n.type) {
    case "price_alert":
      return priceAlertText(n, t);

    case "seller_lead":
      return t("notif.sellerLeadReady", { farmer: n.farmer_name || t("notif.aFarmer") });

    case "seller_lead_response":
      return t("notif.sellerLeadResponse", { merchant: n.merchant_name || t("notif.aMerchant") });

    case "merchant_approved":
      return t("notif.merchantApproved");

    // message holds the rejection reason; notifications_type_fields_chk
    // guarantees it is non null for this type.
    case "merchant_rejected":
      return t("notif.merchantRejected", { reason: n.message });

    case "price_reminder":
      return t("notif.priceReminder");

    default:
      return t("notif.generic");
  }
}

// Simple notification list. Unread rows are highlighted; opening the page
// marks everything read (one write, fired once per visit), which clears the
// header bell badge. Rows are plain text: the message composed by the price
// trigger, the crop it concerns, and when it happened.
export default function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const m = useUriMotion();
  const notificationsQ = useMyNotifications();
  const markAllRead = useMarkAllNotificationsRead();
  const markedOnce = useRef(false);

  const rows = notificationsQ.data || [];
  const hasUnread = rows.some((n) => !n.read_at);

  // Mark as read once the list has loaded with unread rows on it. The ref
  // keeps this to a single write per visit; the minute-level poll refetching
  // in the background must not retrigger it.
  useEffect(() => {
    if (markedOnce.current) return;
    if (!notificationsQ.isSuccess || !hasUnread) return;
    markedOnce.current = true;
    markAllRead.mutate();
  }, [notificationsQ.isSuccess, hasUnread]); // eslint-disable-line react-hooks/exhaustive-deps

  const locale = i18n.language === "kn" ? "kn-IN" : "en-IN";

  return (
    <div className="flex flex-col flex-1 pb-10 w-full mx-auto max-w-screen-md px-4 md:px-6">
      <Header showBack title={t("notif.title")}/>

      <motion.section variants={m.stagger} initial="hidden" animate="show" className="py-6">
        <motion.h1 variants={m.fadeUp} className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-chilli-700">
          {t("notif.title")}
        </motion.h1>
      </motion.section>

      {notificationsQ.isError ? (
        <LoadError onRetry={() => notificationsQ.refetch()}/>
      ) : notificationsQ.isLoading ? (
        <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 animate-pulse h-24"/>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center">
          <p className="text-sm font-semibold text-ink-700">{t("notif.empty")}</p>
          <p className="text-xs text-ink-500 mt-1">{t("notif.hint")}</p>
        </div>
      ) : (
        <motion.ul variants={m.stagger} initial="hidden" animate="show" className="space-y-3">
          {rows.map((n) => {
            const unread = !n.read_at;
            return (
              <motion.li key={n.id} variants={m.fadeUp}
                className={`rounded-3xl border shadow-sm p-5 ${
                  unread ? "bg-coorg-50 border-coorg-200" : "bg-white border-ink-200"
                }`}>
                <div className="flex items-start gap-3">
                  {unread && <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-coorg-600 shrink-0" aria-hidden="true"/>}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink-900 font-semibold break-words">{notificationText(n, t)}</p>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-ink-500">
                      <span className="inline-flex items-center rounded-full bg-paper-2 border border-ink-100 px-2 py-0.5 font-bold">{n.crop_name}</span>
                      <span>
                        {new Date(n.created_at).toLocaleDateString(locale, {
                          day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.li>
            );
          })}
        </motion.ul>
      )}
    </div>
  );
}

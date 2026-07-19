import { useState, useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { RateForm } from "./RateForm";
import { SellerLeadsTab } from "./SellerLeadsTab";
import { useAuth } from "../auth/useAuth";
import {
  useMyListings,
  useSaveListing,
  useToggleListingActive,
  useDeleteListing,
  useConfirmTodaysPrices,
} from "./useMerchant";
import { useSellerLeadsUnreadCount } from "../sellerLeads/useSellerLeads";
import { usePushRegistration } from "../alerts/usePushRegistration";
import { toast } from "../../components/ui/Toast";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import { formatINR } from "../../lib/constants";

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const m = useUriMotion();
  const nav = useNavigate();
  const location = useLocation();
  const { profile } = useAuth();

  const listingsQ     = useMyListings(profile?.id);
  const saveListing   = useSaveListing();
  const toggleActive  = useToggleListingActive();
  const deleteOne     = useDeleteListing();
  const confirmPrices = useConfirmTodaysPrices();
  const leadsUnread   = useSellerLeadsUnreadCount(profile?.id);
  const { promptAfterFollow } = usePushRegistration();

  // formMode: null when closed, "new" when adding, the listing object when editing.
  // Single state guarantees only one form open at a time, and closing fully unmounts
  // the form so the next "Add crop" gets a clean slate.
  const [formMode, setFormMode] = useState(null);
  const [dashTab, setDashTab] = useState("crops");
  // MerchantPendingGuard redirects here with state.welcome set the moment a
  // merchant is approved. The card below offers push at that point, from a
  // real tap: the browser only shows the permission prompt in response to a
  // user gesture, and promptAfterFollow burns its one-shot flag whether or not
  // a prompt appeared.
  // Route state persists across a refresh (React Router keeps it in
  // window.history.state), so this card can reappear if the merchant refreshes
  // before dismissing it. Low harm: tapping the button just re-runs
  // promptAfterFollow, which safely no-ops if permission was already decided.
  const [welcomeDone, setWelcomeDone] = useState(false);
  // Transient "Confirmed" checkmark shown on the confirm button for ~2s after a
  // successful confirm. A ref holds the timer so it is cleared on unmount.
  const [justConfirmed, setJustConfirmed] = useState(false);
  const confirmFlashTimer = useRef(null);
  useEffect(() => () => {
    if (confirmFlashTimer.current) clearTimeout(confirmFlashTimer.current);
  }, []);

  if (!profile) return null;

  const listings        = listingsQ.data || [];
  const activeListings  = listings.filter((l) => l.is_active);
  const editingListing  = formMode && formMode !== "new" ? formMode : null;
  const formOpen        = formMode !== null;
  const lastConfirmed   = lastConfirmedLabel(activeListings, t, i18n.language);
  // Only offer the push opt-in card while the browser has not yet decided on
  // notification permission. Once it is "granted" (or "denied"), the real
  // browser state is authoritative and the card must not reappear on refresh,
  // even though location.state.welcome persists in history. This fixes the
  // prompt reappearing after a grant (issue 4a): the card was gated only on the
  // in-memory welcomeDone flag and route state, never on Notification.permission.
  // Second condition only. showWelcome keeps the original trigger
  // (location.state?.welcome) so the push opt-in card still appears ONLY after
  // that trigger fires, never on a plain dashboard load. This just additionally
  // suppresses it once the browser permission is no longer "default" (granted
  // or denied), so it cannot reappear after a grant. Guarded with
  // typeof window.Notification so a browser without the Notification API is
  // simply treated as "not undecided" instead of throwing.
  const pushUndecided   =
    typeof window.Notification !== "undefined" &&
    window.Notification.permission === "default";
  const showWelcome     = !!location.state?.welcome && !welcomeDone && pushUndecided;

  function openAdd()         { setFormMode("new"); }
  function openEdit(listing) { setFormMode(listing); }
  function closeForm()       { setFormMode(null); }

  // promptAfterFollow runs synchronously up to requestPermission on the path
  // that matters, so calling it first keeps the browser's user gesture intact.
  // It never throws, so the card closes the same way whatever the answer is.
  function enableAlerts() {
    promptAfterFollow();
    setWelcomeDone(true);
  }

  async function handleSave(payload) {
    // Duplicate crop_name guard. Only applies when ADDING (no payload.id).
    // Match case-insensitively and trimmed against listings already loaded
    // by useMyListings, no extra query.
    if (!payload.id) {
      const normalized = (payload.crop_name || "").trim().toLowerCase();
      const duplicate = listings.find(
        (l) => (l.crop_name || "").trim().toLowerCase() === normalized
      );
      if (duplicate) {
        toast({
          tone: "err",
          text: t("dashboard.duplicateCropMsg", { cropName: duplicate.crop_name }),
        });
        return;
      }
    }

    try {
      // merchant_id is only needed on insert. On update, payload.id is present
      // and RLS prevents touching another merchant's row anyway.
      const body = payload.id
        ? payload
        : { ...payload, merchant_id: profile.id };
      await saveListing.mutateAsync(body);
      toast({ tone: "ok", text: t("dashboard.savedToast") });
      closeForm();
    } catch (e) {
      toast({ tone: "err", text: e.message || t("dashboard.failedToSave") });
    }
  }

  async function handleToggle(listing, newValue) {
    try {
      await toggleActive.mutateAsync({
        id: listing.id,
        is_active: newValue,
        merchant_id: profile.id,
      });
    } catch (e) {
      toast({ tone: "err", text: e.message || t("dashboard.failedToUpdate") });
    }
  }

  async function handleDelete(listing) {
    if (!confirm(t("dashboard.confirmDeleteCrop", { cropName: listing.crop_name }))) return;
    try {
      await deleteOne.mutateAsync({ id: listing.id, merchant_id: profile.id });
      toast({ tone: "ok", text: t("dashboard.deletedToast") });
      if (editingListing?.id === listing.id) closeForm();
    } catch (e) {
      toast({ tone: "err", text: e.message || t("dashboard.failedToDelete") });
    }
  }

  async function handleConfirm() {
    try {
      await confirmPrices.mutateAsync(profile.id);
      // Transient checkmark on the button for ~2s. The "last confirmed" line
      // below updates on its own once the invalidated listings refetch lands.
      setJustConfirmed(true);
      if (confirmFlashTimer.current) clearTimeout(confirmFlashTimer.current);
      confirmFlashTimer.current = setTimeout(() => setJustConfirmed(false), 2000);
      toast({ tone: "ok", text: t("dashboard.confirmedToast") });
    } catch (e) {
      toast({ tone: "err", text: e.message || t("dashboard.failedToConfirm") });
    }
  }

  return (
    <div className="flex flex-col flex-1 pb-10 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8 isolate">
      <GlowBackdrop/>
      <Header/>

      {showWelcome && (
        <motion.section
          variants={m.fadeUp}
          initial="hidden"
          animate="show"
          className="mt-4 rounded-3xl border-2 border-crop-200 bg-crop-50 p-5"
        >
          <p className="font-display font-extrabold text-base text-ink-900">
            {t("dashboard.welcomeHeading")}
          </p>
          <Button className="w-full mt-3" onClick={enableAlerts}>
            {t("dashboard.welcomePushCta")}
          </Button>
        </motion.section>
      )}

      {/* Dashboard tabs: My Crops (default) and Seller Leads, with an unread badge. */}
      <div className="flex border-b border-ink-100 mt-2">
        <DashTabButton active={dashTab === "crops"} onClick={() => setDashTab("crops")}>
          {t("dashboard.cropsTab")}
        </DashTabButton>
        <DashTabButton active={dashTab === "leads"} onClick={() => setDashTab("leads")} badge={leadsUnread}>
          {t("dashboard.sellerLeadsTab")}
        </DashTabButton>
      </div>

      {dashTab === "crops" && (
      <>
      {/* Top: identity and crop count */}
      <motion.section variants={m.stagger} initial="hidden" animate="show" className="py-6 border-b border-ink-100">
        <motion.h1 variants={m.fadeUp} className="font-display text-2xl md:text-3xl font-extrabold tracking-tight text-chilli-700 leading-tight break-words">
          {profile.business_name}
        </motion.h1>
        <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1">{t("dashboard.yourDailyPrices")}</motion.p>
        <motion.p variants={m.fadeUp} className="text-xs text-ink-500 mt-1 tabular-nums">
          {listings.length === 1
            ? t("dashboard.cropCountOne")
            : t("dashboard.cropCountN", { count: listings.length })}
        </motion.p>
        <motion.button
          variants={m.fadeUp}
          type="button"
          onClick={() => nav("/merchant/history")}
          className="mt-2 text-sm text-coorg-700 font-semibold underline"
        >
          {t("dashboard.priceHistory")}
        </motion.button>
        <motion.button
          variants={m.fadeUp}
          type="button"
          onClick={() => nav("/merchant/crops")}
          className="mt-2 ml-5 text-sm text-coorg-700 font-semibold underline"
        >
          {t("dashboard.browseCrops")}
        </motion.button>
      </motion.section>

      {/* Confirm today's prices. Most prominent action on the screen.
          Only shown when the merchant has at least one active listing. */}
      {activeListings.length > 0 && (
        <section className="pt-6">
          <Button
            size="lg"
            className="w-full"
            onClick={handleConfirm}
            loading={confirmPrices.isPending}
          >
            {justConfirmed ? (
              <>
                <CheckIcon/>
                {t("dashboard.confirmedFlash")}
              </>
            ) : (
              t("dashboard.confirmTodaysPrices")
            )}
          </Button>
          <p className="text-xs text-ink-500 text-center mt-2">
            {lastConfirmed}
          </p>
        </section>
      )}

      {/* Crop list */}
      <section className="pt-6">
        {listingsQ.isError ? (
          <LoadError onRetry={() => listingsQ.refetch()}/>
        ) : listingsQ.isLoading ? (
          <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-6 animate-pulse h-24"/>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center">
            <p className="text-sm font-semibold text-ink-700">
              {t("dashboard.emptyCropsHeading")}
            </p>
            <p className="text-xs text-ink-500 mt-1">
              {t("dashboard.emptyCropsBody")}
            </p>
          </div>
        ) : (
          <motion.ul
            variants={m.stagger}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {listings.map((l) => (
              <ListingRow
                key={l.id}
                listing={l}
                onToggle={(v) => handleToggle(l, v)}
                onEdit={() => openEdit(l)}
                onDelete={() => handleDelete(l)}
                t={t}
                fadeUp={m.fadeUp}
                cardHover={m.cardHover}
              />
            ))}
          </motion.ul>
        )}
      </section>

      {/* Add crop CTA. Hidden while a form is open. */}
      {!formOpen && (
        <section className="pt-4">
          <Button size="lg" variant="outline" className="w-full" onClick={openAdd}>
            {t("dashboard.addCrop")}
          </Button>
        </section>
      )}

      {/* Add / edit form. Shown as a bottom sheet on mobile and a centered modal
          on larger screens, so tapping Edit or Add crop brings the form into
          view immediately instead of appending it below the cards, where on a
          phone it would sit off screen and look like nothing happened. The sheet
          scrolls internally so a tall form stays usable on small screens. */}
      {formOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center"
          onClick={closeForm}
        >
          <div
            className="w-full sm:max-w-lg max-h-[90vh] overflow-y-auto bg-white rounded-t-3xl sm:rounded-3xl shadow-xl p-5 md:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900">
                {editingListing
                  ? t("dashboard.editCropHeading", { cropName: editingListing.crop_name })
                  : t("dashboard.addCrop")}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="min-h-[44px] px-2 -mr-2 text-sm text-ink-500 underline"
              >
                {t("common.cancel")}
              </button>
            </div>
            <RateForm
              listing={editingListing}
              onSave={handleSave}
              onCancel={closeForm}
            />
          </div>
        </div>
      )}
      </>
      )}

      {dashTab === "leads" && (
        <section className="pt-6">
          <SellerLeadsTab merchantId={profile.id}/>
        </section>
      )}
    </div>
  );
}

// Tab button for the dashboard's My Crops / Seller Leads switch, matching
// the underline-on-active styling used by the feed page tabs. An optional
// numeric badge (unread seller leads) renders as a small pill next to the label.
function DashTabButton({ active, onClick, badge, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-h-[48px] px-3 text-sm font-bold border-b-2 transition-colors inline-flex items-center justify-center gap-1.5 ${
        active
          ? "border-coorg-600 text-coorg-700"
          : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-chilli-600 text-white text-[10px] font-bold leading-none inline-flex items-center justify-center">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </button>
  );
}

// Small checkmark for the transient "Confirmed" state on the confirm button.
function CheckIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5"/>
    </svg>
  );
}

// Real last-confirmation line for the merchant's crop set, pulled from the most
// recent confirmed_at among the active listings. Per the issue 5 spec this is
// binary: if the latest confirm happened today, show the local time; otherwise
// (never, or only on an earlier day) show "Not yet confirmed today". The time
// is rendered with the active language's locale (kn-IN or en-IN).
function lastConfirmedLabel(listings, t, lang) {
  let maxTs = null;
  for (const l of listings) {
    if (!l.confirmed_at) continue;
    const ts = Date.parse(l.confirmed_at);
    if (isNaN(ts)) continue;
    if (maxTs == null || ts > maxTs) maxTs = ts;
  }
  if (maxTs == null) return t("dashboard.notYetConfirmedToday");

  const today = new Date();
  const last = new Date(maxTs);
  const sameDay =
    last.getFullYear() === today.getFullYear() &&
    last.getMonth()    === today.getMonth() &&
    last.getDate()     === today.getDate();

  if (!sameDay) return t("dashboard.notYetConfirmedToday");

  const locale = lang === "kn" ? "kn-IN" : "en-IN";
  const time = last.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  return t("dashboard.lastConfirmedTodayAt", { time });
}

function ListingRow({ listing, onToggle, onEdit, onDelete, t, fadeUp, cardHover }) {
  const active = !!listing.is_active;
  const rowDim = active ? "" : "opacity-60";

  // Price line: either the "Call for price" tag, or "₹X unit_label".
  // price_per_kg comes from the DB (generated column). Do NOT recompute here.
  const priceLine = listing.call_for_price
    ? t("card.callForPrice")
    : listing.price != null
      ? t("card.priceUnit", { price: formatINR(listing.price), unit: listing.unit_label })
      : "-";

  const perKgLine =
    !listing.call_for_price && listing.price_per_kg != null
      ? t("card.pricePerKg", { price: formatINR(listing.price_per_kg) })
      : null;

  return (
    <motion.li
      variants={fadeUp}
      whileHover={cardHover}
      className={`bg-white rounded-3xl border border-ink-200 shadow-sm p-5 ${rowDim}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-display font-extrabold text-lg text-ink-900 leading-tight truncate">
            {listing.crop_name}
          </div>
          {listing.variety_notes && (
            <div className="text-xs text-ink-500 truncate mt-0.5">
              {listing.variety_notes}
            </div>
          )}
          <div className="text-base font-extrabold text-coorg-700 mt-2 tabular-nums">
            {priceLine}
          </div>
          {perKgLine && (
            <div className="text-xs text-ink-500 tabular-nums">
              {perKgLine}
            </div>
          )}
          {!active && (
            <div className="text-xs text-ink-500 italic mt-1">
              {t("card.notBuyingToday")}
            </div>
          )}
        </div>

        {/* Active toggle on the right */}
        <div className="shrink-0">
          <Toggle value={active} onChange={onToggle}/>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          {t("common.edit")}
        </Button>
        <Button size="sm" variant="dangerSoft" onClick={onDelete}>
          {t("common.delete")}
        </Button>
      </div>
    </motion.li>
  );
}

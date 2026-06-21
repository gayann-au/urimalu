import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { Button } from "../../components/ui/Button";
import { Toggle } from "../../components/ui/Toggle";
import { RateForm } from "./RateForm";
import { useAuth } from "../auth/useAuth";
import {
  useMyListings,
  useSaveListing,
  useToggleListingActive,
  useDeleteListing,
  useConfirmTodaysPrices,
} from "./useMerchant";
import { toast } from "../../components/ui/Toast";
import { formatINR } from "../../lib/constants";

export default function DashboardPage() {
  const { t, i18n } = useTranslation();
  const nav = useNavigate();
  const { profile } = useAuth();

  const listingsQ     = useMyListings(profile?.id);
  const saveListing   = useSaveListing();
  const toggleActive  = useToggleListingActive();
  const deleteOne     = useDeleteListing();
  const confirmPrices = useConfirmTodaysPrices();

  // formMode: null when closed, "new" when adding, the listing object when editing.
  // Single state guarantees only one form open at a time, and closing fully unmounts
  // the form so the next "Add crop" gets a clean slate.
  const [formMode, setFormMode] = useState(null);

  if (!profile) return null;

  const listings        = listingsQ.data || [];
  const activeListings  = listings.filter((l) => l.is_active);
  const editingListing  = formMode && formMode !== "new" ? formMode : null;
  const formOpen        = formMode !== null;
  const lastConfirmed   = lastConfirmedLabel(activeListings, t, i18n.language);

  function openAdd()         { setFormMode("new"); }
  function openEdit(listing) { setFormMode(listing); }
  function closeForm()       { setFormMode(null); }

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
      toast({ tone: "ok", text: t("dashboard.confirmedToast") });
    } catch (e) {
      toast({ tone: "err", text: e.message || t("dashboard.failedToConfirm") });
    }
  }

  return (
    <div className="flex flex-col flex-1 pb-8 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8">
      <Header/>

      {/* Top: identity and crop count */}
      <section className="px-4 py-5 border-b border-gray-100">
        <h1 className="text-2xl font-bold text-chilli-700 leading-tight">
          {profile.business_name}
        </h1>
        <p className="text-sm text-gray-500 mt-1">{t("dashboard.yourDailyPrices")}</p>
        <p className="text-xs text-gray-400 mt-1 tabular-nums">
          {listings.length === 1
            ? t("dashboard.cropCountOne")
            : t("dashboard.cropCountN", { count: listings.length })}
        </p>
        <button
          type="button"
          onClick={() => nav("/merchant/history")}
          className="mt-2 text-sm text-coorg-700 font-semibold underline"
        >
          {t("dashboard.priceHistory")}
        </button>
      </section>

      {/* Confirm today's prices. Most prominent action on the screen.
          Only shown when the merchant has at least one active listing. */}
      {activeListings.length > 0 && (
        <section className="px-4 pt-5">
          <Button
            size="lg"
            className="w-full"
            onClick={handleConfirm}
            loading={confirmPrices.isPending}
          >
            {t("dashboard.confirmTodaysPrices")}
          </Button>
          <p className="text-xs text-gray-500 text-center mt-2">
            {lastConfirmed}
          </p>
        </section>
      )}

      {/* Crop list */}
      <section className="px-4 pt-5">
        {listingsQ.isLoading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse h-24"/>
        ) : listings.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
            <p className="text-sm font-semibold text-gray-700">
              {t("dashboard.emptyCropsHeading")}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {t("dashboard.emptyCropsBody")}
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {listings.map((l) => (
              <ListingRow
                key={l.id}
                listing={l}
                onToggle={(v) => handleToggle(l, v)}
                onEdit={() => openEdit(l)}
                onDelete={() => handleDelete(l)}
                t={t}
              />
            ))}
          </ul>
        )}
      </section>

      {/* Add crop CTA. Hidden while a form is open. */}
      {!formOpen && (
        <section className="px-4 pt-4">
          <Button size="lg" variant="outline" className="w-full" onClick={openAdd}>
            {t("dashboard.addCrop")}
          </Button>
        </section>
      )}

      {/* Inline form panel. Mounted only when open, so closing fully resets it. */}
      {formOpen && (
        <section className="px-4 pt-4">
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">
                {editingListing
                  ? t("dashboard.editCropHeading", { cropName: editingListing.crop_name })
                  : t("dashboard.addCrop")}
              </h2>
              <button
                type="button"
                onClick={closeForm}
                className="text-sm text-gray-500 underline"
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
        </section>
      )}
    </div>
  );
}

// Find the most recent confirmed_at among the given listings, and return a
// plain readable label. The date is rendered with the active language's
// locale (kn-IN or en-IN).
function lastConfirmedLabel(listings, t, lang) {
  let maxTs = null;
  for (const l of listings) {
    if (!l.confirmed_at) continue;
    const ts = Date.parse(l.confirmed_at);
    if (isNaN(ts)) continue;
    if (maxTs == null || ts > maxTs) maxTs = ts;
  }
  if (maxTs == null) return t("feed.notConfirmedYet");

  const today = new Date();
  const last = new Date(maxTs);
  const sameDay =
    last.getFullYear() === today.getFullYear() &&
    last.getMonth()    === today.getMonth() &&
    last.getDate()     === today.getDate();

  if (sameDay) return t("dashboard.confirmedToday");
  const locale = lang === "kn" ? "kn-IN" : "en-IN";
  const date = last.toLocaleDateString(locale, {
    day: "numeric", month: "short", year: "numeric",
  });
  return t("dashboard.lastConfirmedOn", { date });
}

function ListingRow({ listing, onToggle, onEdit, onDelete, t }) {
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
    <li className={`bg-white rounded-2xl border border-gray-200 p-4 ${rowDim}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-gray-900 truncate">
            {listing.crop_name}
          </div>
          {listing.variety_notes && (
            <div className="text-xs text-gray-500 truncate mt-0.5">
              {listing.variety_notes}
            </div>
          )}
          <div className="text-sm font-semibold text-coorg-700 mt-1 tabular-nums">
            {priceLine}
          </div>
          {perKgLine && (
            <div className="text-xs text-gray-500 tabular-nums">
              {perKgLine}
            </div>
          )}
          {!active && (
            <div className="text-xs text-gray-500 italic mt-1">
              {t("card.notBuyingToday")}
            </div>
          )}
        </div>

        {/* Active toggle on the right */}
        <div className="shrink-0">
          <Toggle value={active} onChange={onToggle}/>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" onClick={onEdit}>
          {t("common.edit")}
        </Button>
        <Button size="sm" variant="subtle" onClick={onDelete}>
          {t("common.delete")}
        </Button>
      </div>
    </li>
  );
}

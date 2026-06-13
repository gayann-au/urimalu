import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useLeadTracking } from "../../hooks/useLeadTracking";
import { FreshnessBadge } from "../../components/ui/FreshnessBadge";
import { BAG_WEIGHTS, formatINR, listingPriceView } from "../../lib/constants";

export function RateCard({ item }) {
  const { t } = useTranslation();
  const { trackLead } = useLeadTracking();
  const m = item.merchant || {};

  const callPhone = m.phone;
  const waPhone = m.whatsapp || m.phone;

  function onCall() {
    if (!callPhone) return;
    trackLead(m.id, "CALL");
    window.location.href = `tel:${callPhone}`;
  }

  function onWa() {
    if (!waPhone) return;
    trackLead(m.id, "WHATSAPP");
    const num = String(waPhone).replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(t("profile.waMessage", { name: m.business_name || "" }));
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
  }

  const price = listingPriceView(item);
  const showBagTotals = price.mode === "perkg" && price.perKg != null;

  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition">
      {/* Top: crop name + freshness badge (top right) */}
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">
          {item.crop_name}
        </h3>
        <FreshnessBadge confirmedAt={item.confirmed_at} className="mt-0.5 shrink-0" />
      </div>
      <p className="text-sm text-gray-500 mt-0.5 truncate">
        {m.business_name}
        {m.town && m.business_name ? ", " : ""}
        {m.town}
      </p>

      {/* Price */}
      <PriceBlock price={price} t={t} />

      {/* Weight conversion: per-kg listings only */}
      {showBagTotals && <BagTotals perKg={price.perKg} t={t} />}

      {item.variety_notes && (
        <div className="mt-3 text-xs text-gray-500">{item.variety_notes}</div>
      )}
      {item.notes && (
        <div className="mt-1 text-xs text-gray-500 italic">{item.notes}</div>
      )}

      {/* Actions: Call as outline, WhatsApp as solid green. No raw number shown. */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCall}
          className="min-h-[48px] rounded-xl border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm hover:bg-coorg-50 transition"
        >
          {t("common.call")}
        </button>
        <button
          type="button"
          onClick={onWa}
          className="min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition"
        >
          {t("common.whatsapp")}
        </button>
      </div>
    </article>
  );
}

// Price display. Three shapes: call-for-price, a per-kg hero, or a unit hero
// (bag or quintal) with a quiet per-kg line below. Never prints "per" twice.
function PriceBlock({ price, t }) {
  if (price.mode === "call") {
    return <div className="mt-3 text-lg font-bold text-gray-600">{t("card.callForPrice")}</div>;
  }

  if (price.mode === "perkg") {
    if (price.hero == null) {
      return <div className="mt-3 text-lg font-bold text-gray-500">-</div>;
    }
    return (
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold text-coorg-700 tabular-nums">{formatINR(price.hero)}</span>
        <span className="text-sm font-semibold text-gray-500">{t("card.perKgSuffix")}</span>
      </div>
    );
  }

  // mode "unit": entered price is the hero, per-kg is the quiet secondary line.
  if (price.hero == null) {
    return <div className="mt-3 text-lg font-bold text-gray-500">-</div>;
  }
  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold text-coorg-700 tabular-nums">{formatINR(price.hero)}</span>
        <span className="text-sm font-semibold text-gray-500">{unitPhrase(t, price.unitLabel)}</span>
      </div>
      {price.perKg != null && (
        <div className="mt-1 text-sm text-gray-500 tabular-nums">
          {t("card.thatIsPerKg", { price: formatINR(price.perKg) })}
        </div>
      )}
    </div>
  );
}

// Build "per <unit>" without ever doubling the word "per": if the stored label
// already starts with "per" (e.g. "per kg"), show it as is.
function unitPhrase(t, unitLabel) {
  const label = (unitLabel || "").trim();
  if (/^per\b/i.test(label)) return label;
  return t("card.perUnit", { unit: label });
}

// "See total for a bag": tappable weight chips that multiply price_per_kg.
// Local component state only, no backend.
function BagTotals({ perKg, t }) {
  const [weight, setWeight] = useState(50);
  const total = Math.round(weight * Number(perKg));
  return (
    <div className="mt-4 rounded-xl bg-gray-50 border border-gray-100 p-3">
      <div className="text-xs font-semibold text-gray-500">{t("card.seeTotalForBag")}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {BAG_WEIGHTS.map((w) => {
          const active = w === weight;
          return (
            <button
              key={w}
              type="button"
              onClick={() => setWeight(w)}
              className={`min-h-[36px] rounded-full px-3 text-xs font-bold border-2 transition ${
                active
                  ? "bg-coorg-600 text-white border-coorg-600"
                  : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
              }`}
            >
              {t("card.weightChip", { weight: w })}
            </button>
          );
        })}
      </div>
      <div className="mt-2 text-sm font-bold text-gray-800 tabular-nums">
        {t("card.weightTotal", { weight, total: formatINR(total) })}
      </div>
    </div>
  );
}

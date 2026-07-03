import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useLeadTracking } from "../../hooks/useLeadTracking";
import { FreshnessBadge } from "../../components/ui/FreshnessBadge";
import { useUriMotion } from "../../lib/uiMotion";
import { BAG_WEIGHTS, formatINR, listingPriceView, formatValidTill } from "../../lib/constants";

// Coffee-bean glyph, the soft crop icon shared with the merchant profile cards.
function BeanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="6.5" ry="9" />
      <path d="M12 3.5c-2.4 3-2.4 14 0 17" />
    </svg>
  );
}

export function RateCard({ item }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const { trackLead } = useLeadTracking();
  const merchant = item.merchant || {};

  const callPhone = merchant.phone;
  const waPhone = merchant.whatsapp || merchant.phone;

  function onCall() {
    if (!callPhone) return;
    trackLead(merchant.id, "CALL");
    window.location.href = `tel:${callPhone}`;
  }

  function onWa() {
    if (!waPhone) return;
    trackLead(merchant.id, "WHATSAPP");
    const num = String(waPhone).replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(t("profile.waMessage", { name: merchant.business_name || "" }));
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
  }

  const price = listingPriceView(item);
  const showBagTotals = price.mode === "perkg" && price.perKg != null;
  const validTill = formatValidTill(item.valid_till);

  return (
    <motion.article
      variants={m.fadeUp}
      whileHover={m.cardHover}
      className="bg-white rounded-[18px] border border-ink-200 shadow-sm hover:shadow-md hover:border-crop-200 p-6 transition-colors"
    >
      {/* Top: crop name with icon box, then the freshness pill on its own
          line. Beside the name (with nowrap text) the pill crushed long crop
          names to a single letter, because it refused to shrink. */}
      <div className="flex items-center gap-3 min-w-0">
        <span className="h-11 w-11 rounded-2xl bg-crop-50 text-crop-600 grid place-items-center shrink-0">
          <BeanIcon/>
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-display text-lg font-extrabold tracking-tight text-ink-900 leading-tight truncate">
            {item.crop_name}
          </h3>
          <p className="text-sm text-ink-500 mt-0.5 truncate">
            {merchant.business_name}
            {merchant.town && merchant.business_name ? ", " : ""}
            {merchant.town}
          </p>
        </div>
      </div>
      <div className="mt-2.5">
        <FreshnessBadge confirmedAt={item.confirmed_at} className="bg-paper-2 rounded-full px-2.5 py-1" />
      </div>

      {/* Price */}
      <PriceBlock price={price} t={t} />

      {/* Weight conversion: per-kg listings only */}
      {showBagTotals && <BagTotals perKg={price.perKg} t={t} />}

      {validTill && (
        <div className="mt-3 text-xs text-ink-500">
          {t("card.priceValidTill", { date: validTill })}
        </div>
      )}

      {item.variety_notes && (
        <div className="mt-3 text-xs text-ink-500">{item.variety_notes}</div>
      )}
      {item.notes && (
        <div className="mt-1 text-xs text-ink-500 italic">{item.notes}</div>
      )}

      {/* Actions: Call as outline, WhatsApp as solid green. No raw number shown. */}
      <div className="mt-5 grid grid-cols-2 gap-3">
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
    </motion.article>
  );
}

// Price display. Three shapes: call-for-price, a per-kg hero, or a unit hero
// (bag or quintal) with a quiet per-kg line below. Never prints "per" twice.
function PriceBlock({ price, t }) {
  if (price.mode === "call") {
    return <div className="mt-4 text-lg font-bold text-ink-700">{t("card.callForPrice")}</div>;
  }

  if (price.mode === "perkg") {
    if (price.hero == null) {
      return <div className="mt-4 text-lg font-bold text-ink-400">-</div>;
    }
    return (
      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold text-coorg-700 tabular-nums">{formatINR(price.hero)}</span>
        <span className="text-sm font-semibold text-ink-500">{t("card.perKgSuffix")}</span>
      </div>
    );
  }

  // mode "unit": entered price is the hero, per-kg is the quiet secondary line.
  if (price.hero == null) {
    return <div className="mt-4 text-lg font-bold text-ink-400">-</div>;
  }
  return (
    <div className="mt-4">
      <div className="flex items-baseline gap-1.5">
        <span className="text-3xl font-extrabold text-coorg-700 tabular-nums">{formatINR(price.hero)}</span>
        <span className="text-sm font-semibold text-ink-500">{unitPhrase(t, price.unitLabel)}</span>
      </div>
      {price.perKg != null && (
        <div className="mt-1 text-sm text-ink-500 tabular-nums">
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
    <div className="mt-4 rounded-2xl bg-paper-2 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-ink-500">{t("card.seeTotalForBag")}</div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {BAG_WEIGHTS.map((w) => {
          const active = w === weight;
          return (
            <button
              key={w}
              type="button"
              onClick={() => setWeight(w)}
              className={`min-h-[36px] rounded-full px-3.5 text-xs font-bold border-2 transition-colors ${
                active
                  ? "bg-coorg-600 text-white border-coorg-600"
                  : "bg-white text-ink-700 border-ink-200 hover:border-coorg-300"
              }`}
            >
              {t("card.weightChip", { weight: w })}
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-sm font-bold text-ink-800 tabular-nums">
        {t("card.weightTotal", { weight, total: formatINR(total) })}
      </div>
    </div>
  );
}

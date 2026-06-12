import { useLeadTracking } from "../../hooks/useLeadTracking";
import { formatINR } from "../../lib/constants";

export function RateCard({ item }) {
  const { trackLead } = useLeadTracking();
  const m = item.merchant || {};

  const callPhone = m.phone;
  const waPhone   = m.whatsapp || m.phone;

  function onCall() {
    if (!callPhone) return;
    trackLead(m.id, "CALL");
    window.location.href = `tel:${callPhone}`;
  }

  function onWa() {
    if (!waPhone) return;
    trackLead(m.id, "WHATSAPP");
    const num = String(waPhone).replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      `Namaste ${m.business_name || ""}, I saw your rate on CoorgRate.`
    );
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
  }

  // Price line: either "Call for price" or "5000 per 50kg bag".
  const priceLine = item.call_for_price
    ? "Call for price"
    : item.price != null
      ? `${formatINR(item.price)} per ${item.unit_label}`
      : "-";

  // Per-kg headline. Hidden when call_for_price is on. This is the comparison
  // number, so it gets the largest visual weight.
  const perKgLine =
    !item.call_for_price && item.price_per_kg != null
      ? `${formatINR(item.price_per_kg)} per kg`
      : null;

  const freshLabel = freshnessLabel(item.confirmed_at);

  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition">
      {/* Top: crop name + merchant identity */}
      <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">
        {item.crop_name}
      </h3>
      <p className="text-sm text-gray-500 mt-0.5 truncate">
        {m.business_name}
        {m.town && m.business_name ? ", " : ""}
        {m.town}
      </p>

      {/* Per-kg headline (the comparison number) */}
      {perKgLine ? (
        <div className="mt-3 text-2xl font-extrabold text-coorg-700 tabular-nums">
          {perKgLine}
        </div>
      ) : (
        <div className="mt-3 text-lg font-bold text-gray-500">
          {priceLine}
        </div>
      )}

      {/* Secondary: full price line shown only when per-kg headline is present */}
      {perKgLine && (
        <div className="mt-1 text-sm text-gray-600 tabular-nums">
          {priceLine}
        </div>
      )}

      {item.variety_notes && (
        <div className="mt-2 text-xs text-gray-500">{item.variety_notes}</div>
      )}
      {item.notes && (
        <div className="mt-1 text-xs text-gray-500 italic">{item.notes}</div>
      )}

      {/* Freshness from confirmed_at */}
      <div className="mt-3 text-xs text-gray-400">{freshLabel}</div>

      {/* Actions */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onCall}
          className="min-h-[48px] rounded-xl border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm hover:bg-coorg-50 transition"
        >
          Call
        </button>
        <button
          type="button"
          onClick={onWa}
          className="min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition"
        >
          WhatsApp
        </button>
      </div>
    </article>
  );
}

// "Updated today" if confirmed_at is today, otherwise the date.
function freshnessLabel(confirmedAt) {
  if (!confirmedAt) return "Not confirmed yet";
  const t = Date.parse(confirmedAt);
  if (isNaN(t)) return "";
  const today = new Date();
  const d = new Date(t);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth()    === today.getMonth() &&
    d.getDate()     === today.getDate();
  if (sameDay) return "Updated today";
  return `Updated ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
}

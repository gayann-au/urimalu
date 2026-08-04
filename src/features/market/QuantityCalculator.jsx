import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useUriMotion } from "../../lib/uiMotion";
import { formatMarketPrice, quantityUnitFor } from "../../lib/marketCrops";
import { DataAgeLine } from "./DataAgeLine";

// WHAT A QUANTITY IS WORTH AT THE BOARD RATE.
//
// A farmer does not have a unit price problem. They have forty bags in the
// shed and want to know what forty bags comes to. Everyone publishing rates in
// Kodagu stops at the per-bag number and leaves that multiplication to be done
// on a phone calculator, or not at all.
//
// IT IS ARITHMETIC, NOT ADVICE. It multiplies the published range by a number
// the farmer typed and says so. There is no sentence here about whether the
// total is good, whether to sell, or when. The one line of prose under the
// result says what the figure is and names three ordinary reasons a buyer's
// offer will differ from it: moisture, outturn and grade.
//
// It is not a quote and it is not an offer. The result is labelled as the
// board value throughout, and the board's own date and source sit directly
// below it in the section, so the number can never be read as today's price
// from a named buyer.

// Guard against a paste of a hundred digits producing a total in scientific
// notation. Ten million bags is far past any real holding and still formats.
const MAX_QUANTITY = 10_000_000;

// Digits only. No sign, no exponent, no decimal point: bags come whole, and
// kilos to the gram is not a number anyone reads off a board rate. Stripping
// rather than rejecting means a stray character never blocks the field.
function sanitize(raw) {
  return String(raw).replace(/[^0-9]/g, "").slice(0, 9);
}

export function QuantityCalculator({ entries }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  // Only crops whose stored unit this app can actually count. A row quoted in
  // a unit quantityUnitFor does not know is left out of the chooser rather
  // than multiplied on a guess.
  const options = useMemo(
    () => entries.filter((e) => quantityUnitFor(e.row.unit)),
    [entries]
  );

  const [cropKey, setCropKey] = useState(null);
  const [quantity, setQuantity] = useState("");

  if (options.length === 0) return null;

  // The chooser defaults to the first crop in the board's own fixed catalogue
  // order. Not the dearest, not the one with the freshest row: ordering by
  // anything about the numbers would rank crops for the reader, which is the
  // verdict this feature does not give.
  const selected = options.find((o) => o.cropKey === cropKey) ?? options[0];
  const row = selected.row;
  const countUnit = quantityUnitFor(row.unit);

  const n = quantity === "" ? null : Number(quantity);
  // Empty, zero and anything past the ceiling all mean "no total to show", so
  // the result block renders a hint instead of "₹0" or a number in exponent
  // form. Zero bags is not a broken input, it just has no answer worth
  // printing.
  const hasQuantity = n !== null && Number.isFinite(n) && n > 0 && n <= MAX_QUANTITY;

  const low = hasQuantity ? Number(row.price_min) * n : null;
  const highRaw = row.price_max;
  // hasPriceBand is what makes multiplying the far end legitimate. It is true
  // for a row quoting a band, where both ends are prices the same lot could
  // fetch. It is false for the cardamom auction row, where price_min is the
  // day's average and price_max is the highest price one lot made: stretching
  // that top figure across a whole holding would tell a farmer their crop is
  // worth what the best lot in the district made. So on those rows only the
  // average is multiplied and the total is a single number.
  const hasHigh =
    selected.hasPriceBand &&
    highRaw != null && highRaw !== "" && !isNaN(Number(highRaw)) &&
    Number(highRaw) !== Number(row.price_min);
  const high = hasQuantity && hasHigh ? Number(highRaw) * n : null;

  // Both ends go through the same formatter the board uses, so the total is
  // grouped and symbolled exactly like the rate it came from.
  const totalText = hasQuantity
    ? high != null
      ? t("market.priceRange", {
          min: formatMarketPrice(low, row.unit),
          max: formatMarketPrice(high, row.unit),
        })
      : formatMarketPrice(low, row.unit)
    : null;

  return (
    <motion.section
      variants={m.fadeUp}
      className="mt-3 rounded-[18px] border border-ink-100 bg-white p-4 shadow-uri-sm"
      aria-label={t("market.calc.heading")}
    >
      <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
        {t("market.calc.heading")}
      </h3>
      <p className="mt-1 text-xs text-ink-500">{t("market.calc.intro")}</p>

      {/* The crop chooser. Every rate on the board above stays visible; this
          only picks which one to multiply, so it hides no price from anyone. */}
      <div
        className="mt-3 flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("market.calc.cropLabel")}
      >
        {options.map((o) => {
          const active = o.cropKey === selected.cropKey;
          return (
            <button
              key={o.cropKey}
              type="button"
              onClick={() => setCropKey(o.cropKey)}
              aria-pressed={active}
              className={`min-h-[38px] rounded-full border px-3 text-xs font-bold transition-colors ${
                active
                  ? "border-chilli-600 bg-chilli-600 text-white"
                  : "border-ink-200 bg-white text-ink-700 hover:bg-paper-2"
              }`}
            >
              {/* The board's own label for the entry, carried on it so a chip
                  and the card above it can never name the same thing two
                  different ways. A resolved string rather than a key, because a
                  pepper entry names its market yard as well as its crop and
                  that yard's name comes from the data, not from i18n. */}
              {o.label}
            </button>
          );
        })}
      </div>

      <label className="mt-3 block">
        <span className="text-xs font-bold text-ink-700">
          {t(`market.calc.quantityLabel.${countUnit}`)}
        </span>
        <div className="mt-1 flex items-center gap-2">
          {/* inputMode numeric puts the digit pad up on a phone rather than the
              full keyboard. type is text, not number: a number input adds
              spinners nobody taps, and on some Android keyboards it still
              offers a minus sign and an exponent. The value is sanitised to
              digits on the way in, so the field cannot hold anything else. */}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            value={quantity}
            onChange={(e) => setQuantity(sanitize(e.target.value))}
            placeholder={t("market.calc.placeholder")}
            className="min-h-[48px] w-28 rounded-[14px] border-2 border-ink-200 bg-white px-3 text-lg font-bold text-ink-900 tabular-nums focus:border-chilli-500 focus:outline-none"
          />
          <span className="text-sm text-ink-600">
            {t(`market.calc.countUnit.${countUnit}`)}
          </span>
        </div>
      </label>

      {/* THE RESULT. Labelled as board value on the line above the figure, so
          the number is never on screen without the words that say what it is.
          aria-live announces the new total as it is typed for a reader using a
          screen reader, who would otherwise never learn the field did
          anything. */}
      <div className="mt-3 rounded-[14px] bg-paper-2 p-3" aria-live="polite">
        <p className="text-[11px] font-bold uppercase tracking-wide text-ink-500">
          {t("market.calc.resultLabel")}
        </p>
        {hasQuantity ? (
          <p className="mt-1 font-display text-2xl font-extrabold leading-tight tracking-tight text-ink-900 tabular-nums break-words">
            {totalText}
          </p>
        ) : (
          <p className="mt-1 text-sm text-ink-500">{t("market.calc.awaiting")}</p>
        )}

        {/* The date and source of the rate this total was worked out from.
            Normally the board prints one line below this whole section that
            covers it, and then this is not rendered. It appears when that line
            cannot speak for the selected crop, which is the case for the
            cardamom auction rate and for every crop on the fallback path where
            the board's rows no longer share a date. A multiplied total is still
            a number, so it does not get to skip its date and its source. */}
        {selected.ownProvenance && (
          <DataAgeLine
            sourceDate={row.source_date}
            sourceKey={row.source}
            fetchedAt={row.fetched_at}
          />
        )}
      </div>

      {/* Facts about why a buyer's offer differs from this. Not a
          recommendation, and deliberately no sentence about timing. */}
      <p className="mt-2 text-xs leading-relaxed text-ink-500">
        {t("market.calc.note")}
      </p>
    </motion.section>
  );
}

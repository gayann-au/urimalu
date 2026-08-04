import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useUriMotion } from "../../lib/uiMotion";
import { formatMarketPrice } from "../../lib/marketCrops";
import { DataAgeLine } from "./DataAgeLine";
import {
  UnitLine,
  FlaggedNote,
  canRenderPrice,
  priceTextFor,
} from "./MarketPriceRow";
import { mandiModalPerKg } from "./useMandiPrices";

// One market yard's own pepper prices. One card per yard, never one for pepper.
//
// WHY ONE CARD PER MARKET. Every number on this card is a figure the government
// published for this one yard, carried through unchanged but for the divide
// that turns a quintal price into a kilo price. A farmer can open the official
// source and find these exact numbers against this exact market name. That is
// the whole point, and it is why nothing here is combined with any other yard.
//
// The card this replaced showed a single pepper price of Rs 350, the median of
// the yards' modal prices. On the same day Gonikappal's own range ran from
// Rs 350 to Rs 700, so a farmer holding good pepper was being told his crop was
// worth half what it was. No median, no average, no lowest-across-yards and no
// highest-across-yards appears anywhere on this card.
//
// Two yards side by side with their own numbers need no explanation line. The
// difference between them is the explanation.
//
// The rules the rest of the feature holds are held here too. No advice. No
// colour that means a price is good or bad: the figures are ink-900 and the
// labels ink-500, the app's plain text neutrals.

// The market's own usual price, the line under the range.
//
// Dropped entirely when the row cannot state it, rather than falling back to
// either end of the range. "Usual" and "lowest" are different claims, and a
// card that quietly printed one under the other's label would be wrong in a way
// nobody could see.
function UsualPrice({ row }) {
  const { t } = useTranslation();
  const modal = mandiModalPerKg(row);
  if (modal === null) return null;
  return (
    <p className="mt-2 text-xs text-ink-600">
      {t("market.mandi.pepper.usual", {
        price: formatMarketPrice(modal, row.unit),
      })}
    </p>
  );
}

export function MandiPepperRow({ row, nameKey }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  // The same guard every other card answers to, asked of the same function
  // rather than a copy of its rules. No price without a date and a source.
  if (!canRenderPrice(row)) return null;

  return (
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      className="rounded-[14px] border border-ink-100 bg-white p-3.5 shadow-uri-sm"
    >
      <h3 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-ink-500 break-words">
        {t(nameKey)}
      </h3>

      {/* The yard's own name, directly under the crop and above the price. It
          is what makes two pepper cards tell each other apart, so it sits in
          the reading path rather than in a footnote. Printed exactly as the
          source returned it, because a farmer is going to match this string
          against the official page. */}
      <p className="mt-0.5 text-xs font-medium text-ink-700 break-words">
        {row.display_name}
      </p>

      {/* priceTextFor renders a single figure when the two ends are equal, so a
          yard that published one price does not show "350 to 350" and invent a
          spread the source never had. */}
      <p className="mt-1.5 font-display text-[22px] font-extrabold leading-[1.15] tracking-tight text-ink-900 tabular-nums break-words">
        {priceTextFor(row, t)}
      </p>

      <UnitLine unit={row.unit}/>
      <UsualPrice row={row}/>
      <FlaggedNote row={row}/>

      {/* Always on the card, never deferred to the board's shared line. That
          line speaks for the CPA rows, which come from a different body on a
          different day, and a caption covering both would have to be vague
          enough to be true of either. */}
      <DataAgeLine
        sourceDate={row.source_date}
        sourceKey={row.source}
        fetchedAt={row.fetched_at}
      />
    </motion.article>
  );
}

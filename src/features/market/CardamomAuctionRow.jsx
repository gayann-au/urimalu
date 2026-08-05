import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useUriMotion } from "../../lib/uiMotion";
import { formatMarketPrice } from "../../lib/marketCrops";
import { DataAgeLine } from "./DataAgeLine";
import { UnitLine, FlaggedNote, canRenderPrice } from "./MarketPriceRow";
import { qtySoldKg } from "./useCardamomAuction";

// The cardamom card when the Spices Board auction has published.
//
// WHY THIS IS NOT MarketPriceRow. That component reads price_min and price_max
// as the two ends of a range and prints "min to max", which is right for a CPA
// row quoting a band. On an auction row those two columns are not a band:
// price_min is the day's average price and price_max is the highest price any
// lot fetched. Printing them as a range would put a claim on screen the Spices
// Board never published, and it would look entirely ordinary doing it. So the
// two numbers are labelled separately here and never joined.
//
// Everything else is deliberately the same as the other five cards: the same
// guard, the same unit line, the same age and attribution block, reused from
// MarketPriceRow rather than restated. This card differs because the data
// differs, not because it is special.
//
// The rules the rest of the feature holds are held here too. No advice. No
// colour that means a price is good or bad, so the numbers are ink-900 and the
// labels ink-500, the app's plain text neutrals. The date and the source sit on
// the card, which on this board is what tells a reader at a glance that
// cardamom came from somewhere other than the five cards beside it.

// The quantity sold, in whole kilos.
//
// No decimals. The auction publishes quantity arrived to a tenth of a kilo and
// quantity sold in whole ones, and a farmer reading "how much traded" wants the
// magnitude, not a tenth of a kilo out of seventy thousand. Grouped in the
// Indian convention, the same as every rupee figure on the board.
function formatKg(value) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function hasNumber(value) {
  return value != null && value !== "" && !isNaN(Number(value));
}

// One labelled fact under the main figure. Label above value, not beside it:
// at the 158px a card gets on a 360px phone a label and a number side by side
// wrap into each other and stop reading as a pair.
function AuctionFact({ label, value }) {
  return (
    <div>
      <dt className="text-[11px] leading-tight text-ink-500">{label}</dt>
      <dd className="font-medium leading-tight text-ink-900 tabular-nums">
        {value}
      </dd>
    </div>
  );
}

// className carries the board's stranding rule. See spanClassFor in
// TodaysRatesBoard.jsx.
export function CardamomAuctionRow({ row, nameKey, className = "" }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  // The same guard the other five cards answer to, asked of the same function
  // rather than a copy of its rules. No price without a date and a source.
  if (!canRenderPrice(row)) return null;

  const sold = qtySoldKg(row);

  return (
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      // flex h-full flex-col so a stretched grid row can give this card height
      // without it looking truncated. See BOARD_GRID in TodaysRatesBoard.jsx.
      className={`flex h-full flex-col rounded-[14px] border border-ink-100 bg-white p-3.5 shadow-uri-sm ${className}`}
    >
      <h3 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-ink-500 break-words">
        {t(nameKey)}
      </h3>

      {/* The average is the main figure, at the same size and weight as the
          price on every other card, so the six still read as one board. */}
      <p className="mt-1.5 font-display text-[22px] font-extrabold leading-[1.15] tracking-tight text-ink-900 tabular-nums break-words">
        {formatMarketPrice(row.price_min, row.unit)}
      </p>
      {/* Directly under the number and above the unit, because a bare figure on
          this card would be ambiguous between the average and the highest in a
          way it is not on the other five. */}
      <p className="mt-0.5 text-xs text-ink-500">
        {t("market.auction.averageLabel")}
      </p>

      <UnitLine unit={row.unit}/>

      <dl className="mt-2.5 space-y-1.5 text-xs">
        {hasNumber(row.price_max) && (
          <AuctionFact
            label={t("market.auction.highestLabel")}
            value={formatMarketPrice(row.price_max, row.unit)}
          />
        )}
        {/* Absent, not zero, when the row cannot say. A printed 0 kg would be a
            claim that nothing traded. */}
        {sold !== null && (
          <AuctionFact
            label={t("market.auction.soldLabel")}
            value={t("market.auction.soldValue", { qty: formatKg(sold) })}
          />
        )}
      </dl>

      <FlaggedNote row={row}/>

      {/* Always on the card, never deferred to the board's shared line. The
          five CPA cards share one date and one source and can be captioned once
          beneath them all; this one comes from a different body on a different
          day, and saying so on the card is the only way a reader can tell which
          number they are looking at. */}
      {/* mt-auto holds it against the bottom edge, so a row stretched to a
          taller neighbour opens space above this block rather than below it. */}
      <div className="mt-auto">
        <DataAgeLine
          sourceDate={row.source_date}
          sourceKey={row.source}
          fetchedAt={row.fetched_at}
        />
      </div>
    </motion.article>
  );
}

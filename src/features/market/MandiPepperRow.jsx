import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useUriMotion } from "../../lib/uiMotion";
import { formatMarketPrice } from "../../lib/marketCrops";
import { DataAgeLine } from "./DataAgeLine";
import { UnitLine, FlaggedNote, canRenderPrice } from "./MarketPriceRow";
import { mandiGeographyLevel, mandiMarkets } from "./useMandiPrices";

// The pepper card when the government market yard figure is the one shown.
//
// WHY THIS IS NOT MarketPriceRow. That component prints a price and its unit and
// says nothing about where the price came from beyond the source line, which is
// correct for a CPA row: CPA publishes one district figure, and the body's name
// says everything there is to say about its geography.
//
// A market yard rate does not work that way. The same crop, the same unit and
// the same source line can sit above a rate from the reader's own two market
// yards or a median from the far side of the country, and those are different
// claims. THE LEVEL IS THE POINT OF THIS FILE: a farmer has to be able to tell
// "this is the rate at Gonikappal and Madikeri" from "this is a rate from
// somewhere else in India" at a glance, and neither the price, the unit nor the
// publishing body distinguishes them.
//
// Everything else is deliberately the same as the cards beside it: the same
// guard, the same unit line, the same age and attribution block, reused from
// MarketPriceRow rather than restated. This card differs because the data
// differs, not because it is special.
//
// The rules the rest of the feature holds are held here too. No advice, and no
// colour that means a price is good or bad: the number is ink-900 and the
// geography line ink-600, the app's plain text neutrals. That line states where
// a number came from and is never styled as a warning.

// The i18n key for a stored geography level, or null when there is none.
//
// Matching is exact and an unknown level renders no line, the same refusal to
// guess that unitGlossKey and labelKeyFor make. A level this app has not been
// taught has no wording we can put our own words to, and silence is the safe
// failure: a missing line costs the reader context, whereas a guessed one would
// tell them a rate is local when nothing said it was.
const GEOGRAPHY_LABEL_KEYS = {
  kodagu: "market.mandi.pepper.kodagu",
  karnataka: "market.mandi.pepper.karnataka",
  india: "market.mandi.pepper.india",
};

const LEVEL_KODAGU = "kodagu";

function geographyLabelKeyFor(level) {
  if (!level) return null;
  return Object.prototype.hasOwnProperty.call(GEOGRAPHY_LABEL_KEYS, level)
    ? GEOGRAPHY_LABEL_KEYS[level]
    : null;
}

// The market yard names as one phrase, or null when the row named none.
//
// Only the Kodagu line interpolates this. At the two wider levels the list can
// run to dozens of yards across the country, and naming them would bury the one
// sentence that matters, which is that the rate is not from Kodagu.
function marketsPhrase(row) {
  const markets = mandiMarkets(row);
  if (markets.length === 0) return null;
  // A plain comma join. Kannada takes the same comma, so this holds for both
  // languages today; a language that does not would need a joining key rather
  // than this literal, the same note DataAgeLine carries about its own comma.
  return markets.join(", ");
}

export function MandiPepperRow({ row, nameKey }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  // The same guard the other cards answer to, asked of the same function rather
  // than a copy of its rules. No price without a date and a source.
  if (!canRenderPrice(row)) return null;

  const level = mandiGeographyLevel(row);
  const labelKey = geographyLabelKeyFor(level);
  const markets = marketsPhrase(row);

  // The Kodagu wording names the yards, so it renders only when the row can
  // actually name them. Falling back to the Kodagu sentence with an empty
  // placeholder would print a half sentence making the strongest of the three
  // geographic claims, so a Kodagu row that lost its market list shows no line.
  let geographyLine = null;
  if (labelKey !== null) {
    if (level !== LEVEL_KODAGU) {
      geographyLine = t(labelKey);
    } else if (markets !== null) {
      geographyLine = t(labelKey, { markets });
    }
  }

  return (
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      className="rounded-[14px] border border-ink-100 bg-white p-3.5 shadow-uri-sm"
    >
      <h3 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-ink-500 break-words">
        {t(nameKey)}
      </h3>

      <p className="mt-1.5 font-display text-[22px] font-extrabold leading-[1.15] tracking-tight text-ink-900 tabular-nums break-words">
        {formatMarketPrice(row.price_min, row.unit)}
      </p>

      <UnitLine unit={row.unit}/>

      {geographyLine && (
        <p className="mt-2 text-xs leading-relaxed text-ink-600">
          {geographyLine}
        </p>
      )}

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

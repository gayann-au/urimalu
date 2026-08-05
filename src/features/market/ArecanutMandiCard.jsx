import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useUriMotion } from "../../lib/uiMotion";
import { formatMarketPrice } from "../../lib/marketCrops";
import { DataAgeLine } from "./DataAgeLine";
import { canRenderPrice } from "./MarketPriceRow";
import { MandiAgeNote, isMandiPriceTooOld } from "./MandiFreshness";

// Arecanut from the market yard next door, every variety on one card.
//
// ONE CARD, NOT ONE PER VARIETY. The varieties all come from the same yard on
// the same day, so separate tiles would repeat "Sulya, Dakshina Kannada, not a
// Kodagu rate" once per tile and push the six Kodagu crops off the first screen
// to do it. The thing a reader needs to know once is said once, at the top, and
// the varieties sit under it as a list.
//
// WHY A LIST OF VARIETIES AND NOT ONE ARECANUT PRICE. The two varieties seen on
// the day this was written were 43,000 and 28,000 per quintal. A median across
// them is 35,500, a figure nobody paid for anything, and it would sit here
// looking exactly as solid as a real one. Grades of arecanut are different
// goods; they are listed, never averaged.
//
// The rules the rest of the feature holds are held here too. No advice, no
// colour that means a price is good or bad, and one date and source line
// covering every number on the card, which is honest only because the selector
// that builds these rows takes a single day and only that day.

// Full width, in the run of blocks that make up the board.
//
// It used to sit below the whole board, after the quantity calculator and the
// shared date line. It rendered correctly there and nobody ever saw it: on a
// 360px phone that is a full calculator's height below the rates. A farmer
// scanning today's prices has to meet arecanut with everything else, so it sits
// with them.
//
// Full width rather than a single cell, because a card carrying a heading,
// three sentences and a variable length list does not fit a slot sized for one
// number, and putting it in one would stretch whatever sat beside it to match.
//
// w-full, WHICH REPLACES col-span-2 sm:col-span-3. It was a grid child when the
// board was one grid. The board is now several grids, one per group of cards
// that share a height, and this card sits between them rather than inside any
// of them. A col-span class outside a grid does nothing, so it would have been
// a silent claim to a width it no longer had. No top margin: the surrounding
// space-y does the spacing.
const CARD =
  "w-full rounded-[18px] border border-ink-100 bg-white p-4 shadow-uri-sm";

// One variety and its rate. Name on the left, price on the right, which is the
// one place in this feature a label and a number share a line: this card is full
// width, so there is room here that a 158px grid cell does not have.
function VarietyRow({ row }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-t border-ink-100 pt-2 first:border-t-0 first:pt-0">
      {/* The publisher's own word for the grade, printed as returned. This app
          does not translate it: a variety name is what the market yard called
          the lot, and a wording of our own would be a different claim about
          what was sold. */}
      <span className="text-sm text-ink-700 break-words">
        {row.display_name}
      </span>
      <span className="shrink-0 font-display text-lg font-extrabold leading-tight tracking-tight text-ink-900 tabular-nums">
        {formatMarketPrice(row.price_min, row.unit)}
      </span>
    </li>
  );
}

export function ArecanutMandiCard({ rows }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  // The same guard every price in this feature answers to, applied per row, so
  // a variety that cannot carry its date and source is left out of the list
  // rather than printed without them.
  const shown = (rows || []).filter(canRenderPrice);
  if (shown.length === 0) return null;

  // Every row on this card shares one day by construction: arecanutRows takes
  // the newest source_date and only that date. So one line can speak for all of
  // them, and the first row is as good as any to read it from. That is also why
  // one cutoff test covers the whole list rather than one per variety.
  const first = shown[0];

  // Past the seven day cutoff every rate comes off the card and the note below
  // stands in their place. The card itself stays, because a farmer who came for
  // the arecanut rate has to be told what happened to it.
  const tooOld = isMandiPriceTooOld(first.source_date);

  return (
    <motion.section
      variants={m.fadeUp}
      className={CARD}
      aria-label={t("market.mandi.arecanut.heading")}
    >
      <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
        {t("market.mandi.arecanut.heading")}
      </h3>

      {/* The two facts a reader needs before the numbers mean anything: which
          yard these came from, and that it is not theirs. Above the prices on
          purpose, because a caveat under a number is read after the number has
          already been believed. */}
      <p className="mt-1 text-xs leading-relaxed text-ink-600">
        {t("market.mandi.arecanut.where")}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        {t("market.mandi.arecanut.note")}
      </p>

      {/* WHAT "Cqca" AND "New Variety" ARE.
          Those strings are the government's own, printed exactly as returned
          and never translated, so a farmer can match them against the official
          page. Unexplained they read as codes. This one line says what kind of
          word they are and that each kind fetches its own price, which is the
          whole of what a reader needs before the list means anything.
          Only rendered beside the list. Past the cutoff there are no grade
          names on screen for it to be about. */}
      {!tooOld && (
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          {t("market.mandi.arecanut.grades")}
        </p>
      )}

      {!tooOld && (
        <ul className="mt-3 space-y-2">
          {shown.map((row) => (
            <VarietyRow key={row.crop_key} row={row}/>
          ))}
        </ul>
      )}

      {/* Nothing at all when the yard published today. Past the cutoff this is
          what stands where the list was. See MandiFreshness. */}
      <MandiAgeNote sourceDate={first.source_date} fetchedAt={first.fetched_at}/>

      {/* One block for the whole card. Legitimate only because every row above
          carries the same date and the same source, which is what the selector
          guarantees rather than what this component hopes. */}
      <DataAgeLine
        sourceDate={first.source_date}
        sourceKey={first.source}
        fetchedAt={first.fetched_at}
      />
    </motion.section>
  );
}

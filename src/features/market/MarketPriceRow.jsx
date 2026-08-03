import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useUriMotion } from "../../lib/uiMotion";
import { formatMarketPrice, unitGlossKey } from "../../lib/marketCrops";
import { dataAge } from "../../lib/dataAge";
import { DataAgeLine, canNameSource } from "./DataAgeLine";
import { isFlagged } from "./useMarketSnapshots";

// One priced row inside a board: name, price, unit, gloss. No change line.
//
// This was MarketPriceCard, a standalone card showing one crop at a time. A
// switcher that shows one price and hides five is the wrong shape for a farmer
// who opens the app to see today's rates, so the card became a row and the
// board shows all six at once. The guard below survived that rewrite unchanged,
// because it was never about the layout.
//
// This file is where "every number carries its date and its source" stops being
// a convention and becomes enforced. DataAgeLine refuses to render when it
// cannot state both, but a component that returns null cannot stop its parent
// printing a price above it. canRenderPrice is that stop.

// A row must carry a number worth printing. formatMarketPrice renders "-" for a
// missing value, and a row whose entire content is a dash, correctly dated and
// attributed, is not honest reporting, it is a blank with decoration. Treating
// it as unrenderable lets the board leave it out.
function hasUsablePrice(row) {
  const value = row?.price_min;
  return value != null && value !== "" && !isNaN(Number(value));
}

// THE GUARD. True only when this row can put a number on screen with both its
// date and its source beside it.
//
// The three checks are the three ways a row fails that promise:
//   no usable number      nothing to report
//   unnameable source     DataAgeLine would print no attribution
//   unusable source_date  dataAge returns null, so there is no age to state
//
// The last two ask the same code DataAgeLine asks, canNameSource and dataAge,
// rather than repeating its rules here. That is the point: this row and that
// line cannot disagree about whether a row can be captioned, because there is
// one definition of each answer and both files read it.
//
// Exported because the board and the benchmarks section both have to make the
// same decision one level up: a row that cannot be rendered is left out of the
// board, not left as a gap in the grid. Every caller asks this function rather
// than reimplementing it.
export function canRenderPrice(row) {
  if (!row) return false;
  if (!hasUsablePrice(row)) return false;
  if (!canNameSource(row.source)) return false;
  if (dataAge(row.source_date) === null) return false;
  return true;
}

// The price text for a row, range or single value.
//
// Both ends go through formatMarketPrice, which switches on the stored unit and
// never on the source or crop. formatINR is not called here: it would print a
// rupee sign in front of US cents and drop the decimals a USc/lb quote
// publishes on purpose.
export function priceTextFor(row, t) {
  const min = formatMarketPrice(row.price_min, row.unit);
  const maxValue = row.price_max;
  const hasRange =
    maxValue != null &&
    maxValue !== "" &&
    !isNaN(Number(maxValue)) &&
    Number(maxValue) !== Number(row.price_min);
  if (!hasRange) return min;
  return t("market.priceRange", {
    min,
    max: formatMarketPrice(maxValue, row.unit),
  });
}

// The unit token and its plain-words gloss, in one block so a later edit cannot
// drop the gloss and leave the bare token, or the reverse. An unglossed unit is
// one this app has not been taught; it shows the token alone rather than a
// guessed sentence.
// The plain-words unit, and only that.
//
// The raw stored token used to print underneath the gloss, so every card said
// its unit twice: "for every 50 kg" and then "INR/50kg". The second one is
// notation, and notation earns no space on a card read by farmers with limited
// schooling. The token now lives in the explainer panel instead, where the
// exact unit the source published is still on record.
//
// An unglossed unit is the one case the token still shows. That means a unit
// this app has not been taught, and printing the raw token is better than
// printing nothing at all: a number with no unit anywhere is not reportable.
export function UnitLine({ unit }) {
  const { t } = useTranslation();
  const glossKey = unitGlossKey(unit);
  return (
    <p className="mt-1.5 text-xs text-ink-600">
      {glossKey ? t(glossKey) : unit}
    </p>
  );
}

// The stored token, for the explainer panel. Null when there is no gloss,
// because in that case UnitLine is already showing the token on the face and
// repeating it here would put it on screen twice again.
export function storedUnitNote(unit, t) {
  if (!unit || !unitGlossKey(unit)) return null;
  return t("market.explain.storedUnit", { unit });
}

// A flagged row is a fact with a caveat, not a failure. The number renders
// normally and is not suppressed, and this note is not styled as an error:
// paper-2 and ink-700 are the same neutrals the rest of the feature uses, with
// no warning colour.
//
// whitespace-pre-wrap keeps the newlines the edge function wrote, and
// break-words stops a long unbroken token overflowing. There is no line clamp,
// no truncation and no title attribute: a caveat behind a tooltip is a caveat
// nobody reads.
//
// validation_note is written by our own edge function, so it is trusted text,
// but it is English only. The Kannada UI shows the translated prefix above the
// English note.
export function FlaggedNote({ row }) {
  const { t } = useTranslation();
  if (!isFlagged(row) || !row.validation_note) return null;
  return (
    <div className="mt-2 rounded-xl bg-paper-2 p-2.5 text-xs text-ink-700">
      <p className="font-medium">{t("market.flaggedLabel")}</p>
      <p className="mt-1 whitespace-pre-wrap break-words">
        {row.validation_note}
      </p>
    </div>
  );
}

// One crop, one price. Sits in a grid cell, so it owns no outer margin and no
// width of its own.
//
// showProvenance is false in the ordinary case, where all six rows share one
// source_date and the board prints the age and attribution once beneath them
// all. It turns true only on the board's fallback path, when the rows no longer
// agree on a date and each one has to carry its own. There is no third setting:
// a price on this page always has its date and source somewhere above or below
// it, and the board decides which.
export function MarketPriceRow({ row, nameKey, showProvenance = false }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  // No price at all when provenance is missing. Not a price with a caveat, not
  // a price in grey, not a dash where the number should be. Nothing.
  if (!canRenderPrice(row)) return null;

  return (
    <motion.article
      variants={m.fadeUp}
      // btnTap is the committed scale-on-tap, already { scale: 0.97 } and
      // already undefined under prefers-reduced-motion. Reused rather than a
      // new cardTap added beside it, so there is one tap reaction in the app.
      whileTap={m.btnTap}
      // Depth instead of an outline. A hairline in ink-100 plus the landing's
      // own small shadow lifts the card off the paper, where the old flat
      // ink-200 box just drew a rectangle around it. shadow-uri-sm is the
      // landing's --shadow-sm, copied into the config rather than reinvented.
      className="rounded-[14px] border border-ink-100 bg-white p-3.5 shadow-uri-sm"
    >
      {/* THE HIERARCHY. The crop name is a quiet label and the price is the
          card. It was the other way round when both sat near the same weight
          and the board read as an undifferentiated wall of text. Small caps in
          ink-500 step the name back without hiding it, since a farmer still
          has to know which crop they are looking at. */}
      {/* break-words is load bearing in Kannada, not decoration. "ಅರೇಬಿಕಾ
          ಪಾರ್ಚ್‌ಮೆಂಟ್" has no break opportunity a 158px column can use, and
          without this it runs straight out of the card. */}
      <h3 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-ink-500 break-words">
        {t(nameKey)}
      </h3>

      {/* ink-900 is the plain text colour of this app, not an accent. No colour
          anywhere on this row says anything about whether the number is good or
          bad, and there is no change line for one to sit on. break-words lets a
          two-ended range wrap inside a narrow phone column rather than
          overflowing it or being shrunk to fit. */}
      <p className="mt-1.5 font-display text-[22px] font-extrabold leading-[1.15] tracking-tight text-ink-900 tabular-nums break-words">
        {priceTextFor(row, t)}
      </p>

      <UnitLine unit={row.unit}/>
      <FlaggedNote row={row}/>

      {showProvenance && (
        <DataAgeLine
          sourceDate={row.source_date}
          sourceKey={row.source}
          fetchedAt={row.fetched_at}
        />
      )}
    </motion.article>
  );
}

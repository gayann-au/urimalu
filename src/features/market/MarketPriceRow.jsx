import { useTranslation } from "react-i18next";
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
export function UnitLine({ unit }) {
  const { t } = useTranslation();
  const glossKey = unitGlossKey(unit);
  return (
    <div className="mt-1">
      <p className="text-xs text-ink-600">{unit}</p>
      {glossKey && <p className="text-xs text-ink-500">{t(glossKey)}</p>}
    </div>
  );
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

  // No price at all when provenance is missing. Not a price with a caveat, not
  // a price in grey, not a dash where the number should be. Nothing.
  if (!canRenderPrice(row)) return null;

  return (
    <article className="rounded-[14px] border border-ink-200 bg-white p-4">
      {/* The heading face, matching the merchant cards on this same page. */}
      <h3 className="font-display text-sm font-extrabold leading-tight tracking-tight text-ink-900">
        {t(nameKey)}
      </h3>

      {/* ink-900 is the plain text colour of this app, not an accent. No colour
          anywhere on this row says anything about whether the number is good or
          bad, and there is no change line for one to sit on. break-words lets a
          two-ended range wrap inside a narrow phone column rather than
          overflowing it or being shrunk to fit. */}
      <p className="mt-2 text-xl font-bold leading-tight text-ink-900 tabular-nums break-words">
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
    </article>
  );
}

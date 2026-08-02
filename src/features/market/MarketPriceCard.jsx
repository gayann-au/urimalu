import { useTranslation } from "react-i18next";
import { formatMarketPrice, unitGlossKey } from "../../lib/marketCrops";
import { dataAge } from "../../lib/dataAge";
import { DataAgeLine } from "./DataAgeLine";
import { isFlagged } from "./useMarketSnapshots";

// The physical price card: price, unit, age, attribution. No change line.
//
// This file is where "every number carries its date and its source" stops
// being a convention and becomes enforced. DataAgeLine already refuses to
// render when it cannot state both, but a component that returns null cannot
// stop its parent printing a price above it. canRenderPrice below is that
// stop, and the card's first statement is the guard.

// Sources DataAgeLine has a name for. Kept as a set rather than inferred,
// because the rule is "a source we can name", not "a source that exists".
//
// This mirrors SOURCE_LABEL_KEYS inside DataAgeLine.jsx and the two must stay
// in step: teaching the app a third source means adding it in both places, or
// this card will pass a row that DataAgeLine then refuses to caption, and the
// price disappears with no explanation. The durable fix is one exported
// predicate shared by both files. That is a change to an already committed
// file and has not been made.
const NAMEABLE_SOURCES = new Set(["cpa", "coffee_board"]);

// A row must carry a number worth printing. formatMarketPrice renders "-" for
// a missing value, and a card whose entire content is a dash, correctly dated
// and attributed, is not honest reporting, it is a blank with decoration.
// Treating it as unrenderable lets the strip show its empty state instead.
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
// Exported because MarketStrip has to make the same decision one level up: a
// row that cannot be rendered is an empty state for that crop, not a gap in
// the layout. Both callers must ask this function rather than reimplement it.
export function canRenderPrice(row) {
  if (!row) return false;
  if (!hasUsablePrice(row)) return false;
  if (!NAMEABLE_SOURCES.has(row.source)) return false;
  if (dataAge(row.source_date) === null) return false;
  return true;
}

export function MarketPriceCard({ row }) {
  const { t } = useTranslation();

  // No price at all when provenance is missing. Not a price with a caveat,
  // not a price in grey, not a dash where the number should be. Nothing.
  if (!canRenderPrice(row)) return null;

  // Both ends go through formatMarketPrice, which switches on the stored unit
  // and never on the source or crop. formatINR is not called here: it would
  // print a rupee sign in front of US cents and drop the decimals that a
  // USc/lb quote publishes on purpose.
  const min = formatMarketPrice(row.price_min, row.unit);
  const maxValue = row.price_max;
  const hasRange =
    maxValue != null &&
    maxValue !== "" &&
    !isNaN(Number(maxValue)) &&
    Number(maxValue) !== Number(row.price_min);
  const priceText = hasRange
    ? t("market.priceRange", { min, max: formatMarketPrice(maxValue, row.unit) })
    : min;

  // The stored unit token and its plain-words gloss render in one block so a
  // later edit cannot drop the gloss and leave the bare token, or the reverse.
  // An unglossed unit is one this app has not been taught; it shows the token
  // alone rather than a guessed sentence.
  const glossKey = unitGlossKey(row.unit);

  return (
    <article className="bg-white rounded-[18px] border border-ink-200 shadow-sm p-6">
      {/* ink-900 is the plain text colour of this app, not an accent. No
          colour anywhere on this card says anything about whether the number
          is good or bad, and there is no change line for one to sit on. */}
      <p className="text-3xl font-bold text-ink-900 tabular-nums break-words">
        {priceText}
      </p>

      <div className="mt-1">
        <p className="text-sm text-ink-600">{row.unit}</p>
        {glossKey && <p className="text-sm text-ink-500">{t(glossKey)}</p>}
      </div>

      {/* Renders the date, the source and when we last looked. Guaranteed to
          render by the guard above: canRenderPrice returns false in exactly
          the cases where this would return null. The two are a deliberate
          pair of locks on the same rule, the way held rows are filtered in
          both the query and the selector. */}
      <DataAgeLine
        sourceDate={row.source_date}
        sourceKey={row.source}
        fetchedAt={row.fetched_at}
      />

      {/* A flagged row is a fact with a caveat, not a failure. The number
          above renders normally and is not suppressed, and this note is not
          styled as an error: paper-2 and ink-700 are the same neutrals the
          rest of the feature uses, with no warning colour.

          whitespace-pre-wrap keeps newlines the edge function wrote, and
          break-words stops a long unbroken token overflowing the card. There
          is no line clamp, no truncation and no title attribute anywhere:
          a caveat behind a tooltip is a caveat nobody reads.

          validation_note is written by our own edge function, so it is
          trusted text, but it is English only. The Kannada UI shows the
          translated prefix above the English note. */}
      {isFlagged(row) && row.validation_note && (
        <div className="mt-3 rounded-2xl bg-paper-2 p-3 text-xs text-ink-700">
          <p className="font-medium">{t("market.flaggedLabel")}</p>
          <p className="mt-1 whitespace-pre-wrap break-words">
            {row.validation_note}
          </p>
        </div>
      )}
    </article>
  );
}

import { useTranslation } from "react-i18next";
import { dataAge } from "../../lib/dataAge";
import { formatValidTill } from "../../lib/constants";

// The age and attribution block that sits under every market number.
//
// Two distinct facts, deliberately never merged into one sentence:
//   how old the data is   source_date, the day the source published
//   when we last looked   fetched_at, the day our job last ran
//
// That separation is the whole point. A 47 day old price checked this morning
// is a working app reporting an old fact, and both halves have to be on screen
// for a reader to tell that apart from a broken app.
//
// This component is what makes "every number carries its date and its source"
// checkable rather than a promise. sourceDate and sourceKey are required, and
// when either cannot be stated the component renders nothing at all. See the
// caller contract below, which is the other half of that rule.

// i18n keys for the publishing body, keyed on the exact market_snapshots.source
// value as stored. Two entries today.
//
// THIS IS THE SINGLE DEFINITION of which sources this feature can name.
// The price component carried a second copy until it was removed; the two had
// to be kept in step by hand, and a source added to only one of them made it
// pass a row this line then refused to caption, so the price vanished with no
// explanation. Callers ask canNameSource below rather than keeping a list.
//
// Matching is exact and an unknown source renders no line, which is the same
// refusal to guess that unitGlossKey makes in marketCrops.js. A source we have
// not been taught has no name we can put our own words to, and inventing one
// would attribute a number to a body that did not publish it.
const SOURCE_LABEL_KEYS = {
  cpa: "market.source.cpa",
  coffee_board: "market.source.coffeeBoard",
};

// The i18n key for a stored source value, or null when there is none.
//
// hasOwnProperty rather than a bare lookup: source is data, and a row carrying
// "constructor" or "toString" would otherwise find a function on the prototype
// and read as a nameable source.
function labelKeyFor(source) {
  if (!source) return null;
  return Object.prototype.hasOwnProperty.call(SOURCE_LABEL_KEYS, source)
    ? SOURCE_LABEL_KEYS[source]
    : null;
}

// Whether this feature has a name for a stored source value.
//
// canRenderPrice in MarketPriceRow uses this to refuse a price it could not
// attribute. Both that guard and this component read the one map above, so the
// row and the line cannot disagree about which sources are nameable.
export function canNameSource(source) {
  return labelKeyFor(source) !== null;
}

// Below this the day count is suppressed and the date stands alone.
//
// "Priced 2 Aug 2026, today" is not a sentence anyone writes, and "Priced 1 Aug
// 2026, 1 day ago" only restates the date sitting next to it. From two days up
// the count carries information the date does not, because it saves the reader
// doing the subtraction. market.ageToday and market.ageDay stay in the language
// files unused; they cost nothing and a later caller may want them.
const MIN_DAYS_TO_SHOW_COUNT = 2;

// Shown only on the stale band, and it is the only mark that changes between
// bands besides the weight. No colour anywhere in this component means good or
// bad about a price: stale is ink-700, everything else is ink-500, and neither
// is a verdict on the number.
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

// Local calendar parts for a timestamp, or null when it cannot be read.
//
// fetched_at is a timestamptz, a real instant, so new Date() is correct for it.
// That is the opposite of source_date, which is a date column and is handled by
// dataAge.js and formatValidTill through their YYYY-MM-DD prefix. The two look
// inconsistent side by side and are not: parsing a date column as an instant is
// the bug dataAge.js exists to avoid, and formatting an instant by its stored
// prefix is the same bug pointing the other way, because the prefix of
// "2026-08-02T20:30:00Z" is 2 August while a reader in IST is already on the
// third.
function localDateParts(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() };
}

// "YYYY-MM-DD" for the reader's local calendar day, so formatValidTill renders
// the same day the isSameDay check below reasons about.
function toLocalIsoDay(parts) {
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

function isSameDay(a, b) {
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

// CALLER CONTRACT. This returns null when it cannot state both the date and the
// source, which means a caller must not render the price either. A number
// without its date and its source is the one thing this feature does not ship,
// and there is no exemption for a row whose date failed to parse.
export function DataAgeLine({ sourceDate, sourceKey, fetchedAt }) {
  const { t } = useTranslation();

  const age = dataAge(sourceDate);
  const sourceLabelKey = labelKeyFor(sourceKey);
  if (!age || !sourceLabelKey) return null;

  const pricedOn = t("market.pricedOn", { date: formatValidTill(sourceDate) });
  // The comma is untranslated punctuation joining two translated fragments.
  // Kannada takes the same comma, so this holds for both languages today. A
  // language that does not would need a joining key rather than this literal.
  const pricedLine =
    age.days >= MIN_DAYS_TO_SHOW_COUNT
      ? `${pricedOn}, ${t(age.key, age.params)}`
      : pricedOn;

  const isStale = age.band === "stale";

  // The checked line is dropped on its own when fetched_at is missing or
  // unreadable, rather than taking the whole block down with it. It answers
  // "when did we last look", a separate question from the date and source that
  // the number itself has to carry, so losing it costs a reassurance and not
  // the attribution.
  const fetched = localDateParts(fetchedAt);
  const today = localDateParts(Date.now());
  const checkedLine = fetched
    ? t(isSameDay(fetched, today) ? "market.checkedToday" : "market.checkedOn", {
        date: formatValidTill(toLocalIsoDay(fetched)),
      })
    : null;

  return (
    <div className="mt-3 space-y-0.5">
      <p
        className={
          isStale
            ? "flex items-center gap-1.5 text-sm font-medium text-ink-700"
            : "text-sm text-ink-500"
        }
      >
        {isStale && <ClockIcon/>}
        <span>{pricedLine}</span>
      </p>
      <p className="text-sm text-ink-500">{t(sourceLabelKey)}</p>
      {checkedLine && <p className="text-xs text-ink-500">{checkedLine}</p>}
    </div>
  );
}

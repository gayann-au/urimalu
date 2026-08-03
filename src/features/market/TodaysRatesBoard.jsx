import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import { MARKET_CROP_APP_NAMES } from "../../lib/marketCrops";
import { useMarketSnapshots, latestPerKey } from "./useMarketSnapshots";
import { MarketPriceRow, canRenderPrice } from "./MarketPriceRow";
import { DataAgeLine } from "./DataAgeLine";
import { Explainer } from "./Explainer";
import { SectionEyebrow } from "./SectionEyebrow";
import { QuantityCalculator } from "./QuantityCalculator";

// SECTION A. Today's rates, all six CPA crops at once.
//
// This is the hero and it comes first, because a farmer opening the app wants
// every rate at a glance. There is no switcher, no tabs and no accordion: an
// interface that shows one price and hides five makes the reader work to see
// what they came for, and most will only ever see the one crop we chose for
// them.
//
// Farmers and merchants see the same six numbers. Role is not read in this
// file at all.

// The six crops, in fixed catalogue order, read from the committed map so
// there is no second list to drift from the first. Object key order is
// insertion order for string keys, and that map is written in the order these
// are meant to appear.
//
// The order is fixed and never sorted. Not by price, not by how recent the
// data is, not by which crop has a row today. Ordering by anything about the
// numbers would rank crops for the reader, which is a verdict, and this
// feature does not give verdicts.
const CROP_KEYS = Object.keys(MARKET_CROP_APP_NAMES);

const SOURCE_CPA = "cpa";

// The CPA rows for the six crops, in catalogue order, keeping only the ones
// that can be shown with their date and source. Crops with no row are simply
// absent: a placeholder tile saying nothing is worse than a shorter board.
function cpaRowsInOrder(rows) {
  const latest = latestPerKey(rows);
  const byCrop = new Map();
  for (const row of latest) {
    if (row.source === SOURCE_CPA) byCrop.set(row.crop_key, row);
  }
  return CROP_KEYS.map((cropKey) => ({ cropKey, row: byCrop.get(cropKey) }))
    .filter((entry) => canRenderPrice(entry.row));
}

// Whether one age and attribution line can honestly stand for the whole board.
//
// Today all six rows carry one source_date and source cpa, so the line goes
// once at section level instead of six times. That is a fact about the data,
// not a promise, so it is checked rather than assumed: if a later refresh
// leaves the rows on different dates, this returns null and the board falls
// back to a line under every row. The rule that every number carries its date
// never bends, only where the date is printed does.
//
// fetchedAt is the oldest of the six on purpose. "We last checked" has to be
// true of every number above it, and the newest would overstate that for the
// rows checked earlier.
function sharedProvenance(entries) {
  if (entries.length === 0) return null;

  const first = entries[0].row;
  let oldestFetchedAt = first.fetched_at;

  for (const { row } of entries) {
    if (row.source_date !== first.source_date) return null;
    if (row.source !== first.source) return null;
    const current = Date.parse(row.fetched_at);
    const oldest = Date.parse(oldestFetchedAt);
    if (!isNaN(current) && (isNaN(oldest) || current < oldest)) {
      oldestFetchedAt = row.fetched_at;
    }
  }

  return {
    sourceDate: first.source_date,
    sourceKey: first.source,
    fetchedAt: oldestFetchedAt,
  };
}

// The stored unit tokens behind the six cards, for the explainer panel.
//
// The board's explainer is one panel for all six crops, and those crops do not
// share a unit: coffee is quoted per 50 kg and pepper and cardamom per kg. So
// this lists the distinct tokens rather than naming one, which would be true
// of four cards and wrong about two.
function storedUnitsNote(entries, t) {
  const units = [...new Set(entries.map((e) => e.row.unit).filter(Boolean))];
  if (units.length === 0) return null;
  return t("market.explain.storedUnits", { units: units.join(", ") });
}

// Two columns on a phone. These are short numbers and six of them fit in a
// glance at this width, which is the entire point of the section. It stays two
// wide up to sm and goes three wide on a tablet, so a desktop reader does not
// get six columns of mostly whitespace.
const BOARD_GRID = "grid grid-cols-2 gap-2.5 sm:grid-cols-3";

export function TodaysRatesBoard() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const snapshotsQ = useMarketSnapshots();

  const rows = snapshotsQ.data;
  const entries = rows ? cpaRowsInOrder(rows) : [];
  const shared = sharedProvenance(entries);

  return (
    <motion.section
      className="mt-5"
      aria-label={t("market.today.heading")}
      variants={m.stagger}
      initial="hidden"
      // animate, not whileInView. This section mounts already in the viewport
      // at the top of the feed, and the in-view observer sometimes never fires
      // in that case, which would leave the whole board stuck at opacity 0.
      // CropsTab in FeedPage.jsx carries the same note for the same reason.
      animate="show"
    >
      {/* Heading, eyebrow and intro render in every state, including while
          loading, so the reader sees the section exists rather than a slab. */}
      <motion.div variants={m.fadeUp}>
        <SectionEyebrow labelKey="market.today.eyebrow"/>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-3">
          <h2 className="font-display text-[26px] font-extrabold leading-none tracking-tight text-ink-900">
            {t("market.today.heading")}
          </h2>
          <Explainer bodyKey="market.explain.cpa" extra={storedUnitsNote(entries, t)}/>
        </div>
        <p className="mt-1.5 text-sm text-ink-500">{t("market.intro")}</p>
      </motion.div>

      <div className="mt-3">
        {snapshotsQ.isLoading ? (
          <div className={BOARD_GRID} aria-label={t("market.loading")} data-state="loading">
            {CROP_KEYS.map((cropKey) => (
              <div
                key={cropKey}
                className="h-[104px] animate-pulse rounded-[14px] border border-ink-100 bg-white shadow-uri-sm"
              />
            ))}
          </div>
        ) : snapshotsQ.isError ? (
          <div data-state="error">
            <LoadError onRetry={() => snapshotsQ.refetch()}/>
          </div>
        ) : entries.length === 0 ? (
          // The query succeeded and there is nothing to show, either because
          // no rows came back or because none of them could state its own date
          // and source. Both are the same thing to a reader: no rates today.
          <div
            className="rounded-[18px] border border-ink-100 bg-white p-6 text-sm text-ink-500 shadow-uri-sm"
            data-state="empty"
          >
            {t("market.emptyAll")}
          </div>
        ) : (
          <div data-state="populated">
            {/* The grid is the stagger parent for the six cards, so they
                arrive one after another rather than all at once. */}
            <motion.div className={BOARD_GRID} variants={m.stagger}>
              {entries.map(({ cropKey, row }) => (
                <MarketPriceRow
                  key={cropKey}
                  row={row}
                  nameKey={`market.crop.${cropKey}`}
                  // Only when the rows disagree about their date. See
                  // sharedProvenance above.
                  showProvenance={!shared}
                />
              ))}
            </motion.div>

            {/* Sits between the rates and their provenance on purpose, so the
                board's date and source below cover the multiplied total as
                well as the six rates it was worked out from. */}
            <QuantityCalculator entries={entries}/>

            {/* One age and attribution block for the whole board, which is
                what makes the six cards above legible as one set of numbers
                from one body on one day. */}
            {shared && (
              <motion.div variants={m.fadeUp}>
                <DataAgeLine
                  sourceDate={shared.sourceDate}
                  sourceKey={shared.sourceKey}
                  fetchedAt={shared.fetchedAt}
                />
              </motion.div>
            )}
          </div>
        )}
      </div>
    </motion.section>
  );
}

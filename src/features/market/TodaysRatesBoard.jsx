import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import { MARKET_CROP_APP_NAMES } from "../../lib/marketCrops";
import { useMarketSnapshots, latestPerKey } from "./useMarketSnapshots";
import { useCardamomAuction, latestAuctionRow } from "./useCardamomAuction";
import {
  useMandiPrices,
  pepperMarketRows,
  arecanutRows,
  hasRealRange,
} from "./useMandiPrices";
import { MarketPriceRow, canRenderPrice } from "./MarketPriceRow";
import { CardamomAuctionRow } from "./CardamomAuctionRow";
import { MandiPepperRow } from "./MandiPepperRow";
import { ArecanutMandiCard } from "./ArecanutMandiCard";
import { DataAgeLine } from "./DataAgeLine";
import { isMandiPriceTooOld } from "./MandiFreshness";
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

// The crop whose card can come from either source. Named once here so the
// substitution below and the explainer note read off the same constant.
const CARDAMOM_CROP_KEY = "cardamom";

// The other crop with two possible sources. Named once here so the substitution
// below reads off the same constant the rest of the file does.
const PEPPER_CROP_KEY = "pepper";

const KIND_CPA = "cpa";
const KIND_AUCTION = "auction";
const KIND_MANDI = "mandi";

// The rows for the six crops, in catalogue order, keeping only the ones that
// can be shown with their date and source. Crops with no row are simply absent:
// a placeholder tile saying nothing is worse than a shorter board.
//
// Cardamom is the one crop with two possible sources. It takes the Spices Board
// auction when there is one and falls back to the CPA row when there is not.
// The auction is published daily and the CPA figure had gone 48 days stale, so
// the fallback is the older number, never the other way round.
//
// The two are never merged, averaged or reconciled. They are different
// measurements by different bodies on different days, and a card showing one of
// them says on its face which one it is.
//
// WHAT TRAVELS WITH AN ENTRY, and why it is not re-derived downstream.
//
// kind picks the component. nameKey is the label, carried so the card and the
// calculator's chip cannot end up calling the same crop two different things.
//
// hasPriceBand is the one that matters most. On a CPA row price_min and
// price_max are the two ends of a quoted band, so multiplying both by a
// quantity gives a range that means something. On an auction row they are the
// day's average and the highest price a single lot fetched, which is not a band
// at all: multiplying the highest by a whole holding would tell a farmer their
// forty kilos are worth what the best lot in the district made, which is a
// number nobody is going to pay them. So the flag says whether price_max is a
// band end, and the calculator asks that rather than inspecting the source.
function boardEntriesInOrder(rows, auctionRow, pepperRows, t) {
  const latest = latestPerKey(rows);
  const byCrop = new Map();
  for (const row of latest) {
    if (row.source === SOURCE_CPA) byCrop.set(row.crop_key, row);
  }

  // flatMap rather than map, because pepper is no longer one card. One crop in
  // the catalogue can now produce several entries, one per market yard.
  return CROP_KEYS.flatMap((cropKey) => {
    if (cropKey === CARDAMOM_CROP_KEY && canRenderPrice(auctionRow)) {
      return [
        {
          cropKey,
          row: auctionRow,
          kind: KIND_AUCTION,
          // Named for what the Spices Board publishes rather than the board's
          // own crop label. The auction is for Small Cardamom specifically, and
          // Large Cardamom is a different crop grown in other states.
          nameKey: "market.crop.cardamom_auction",
          label: t("market.crop.cardamom_auction"),
          hasPriceBand: false,
        },
      ];
    }

    // PEPPER EXPANDS INTO ONE ENTRY PER MARKET YARD, and falls back to the
    // single CPA row when the yards published nothing.
    //
    // Each entry keeps that yard's own published figures. hasPriceBand is asked
    // per row rather than assumed for the crop: a yard that quoted one price
    // gets false, so the calculator multiplies that figure alone instead of
    // stretching a total across a spread the source never showed.
    if (cropKey === PEPPER_CROP_KEY && pepperRows.length > 0) {
      return pepperRows.map((row) => ({
        // The row's own key, so two yards cannot collide as React children.
        cropKey: row.crop_key,
        row,
        kind: KIND_MANDI,
        nameKey: `market.crop.${cropKey}`,
        // Crop first, then the yard. A calculator chip reading only
        // "Gonikappal APMC" would not say what is being priced.
        label: `${t(`market.crop.${cropKey}`)}, ${row.display_name}`,
        hasPriceBand: hasRealRange(row),
        // Past the seven day cutoff the card withdraws its figure, so the
        // quantity calculator must not be able to multiply it either. The flag
        // travels with the entry rather than being re-derived downstream, which
        // is the same reasoning as hasPriceBand above: one answer, computed
        // once, so the card and the calculator cannot disagree about whether a
        // price may be shown.
        priceHidden: isMandiPriceTooOld(row.source_date),
      }));
    }

    return [
      {
        cropKey,
        row: byCrop.get(cropKey),
        kind: KIND_CPA,
        nameKey: `market.crop.${cropKey}`,
        label: t(`market.crop.${cropKey}`),
        hasPriceBand: true,
      },
    ];
  }).filter((entry) => canRenderPrice(entry.row));
}

// Whether one age and attribution line can honestly stand for the cards passed
// in.
//
// Only ever given the CPA cards now. The cardamom auction card carries its own
// date and source and is not a candidate for the shared line, because it comes
// from a different body on a different day and a caption covering it would have
// to be vague enough to be true of both, which is how a reader ends up unable
// to tell which number came from where.
//
// The CPA rows still share one source_date and source between them, so their
// line goes once beneath them instead of five times. That is a fact about the
// data, not a promise, so it is checked rather than assumed: if a later refresh
// leaves them on different dates, this returns null and the board falls back to
// a line under every row. The rule that every number carries its date never
// bends, only where the date is printed does.
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

// The extra lines under the board's explainer body.
//
// The body names the Coorg Planters' Association, which is true of five of the
// six cards. When cardamom is coming from the auction instead, that body would
// be attributing a number to a body that did not publish it, so the panel gains
// a sentence saying where cardamom came from and how its average was worked
// out. This is the section level counterpart of the source line on the card
// itself: the card says which body, this says what the number means.
//
// Nothing here tells a reader what to do about a price.
function explainerNotes(entries, hasAuction, t) {
  const notes = [];
  if (hasAuction) notes.push(t("market.explain.cardamomAuction"));
  const units = storedUnitsNote(entries, t);
  if (units) notes.push(units);
  return notes.length === 0 ? null : notes.join(" ");
}

// ONE GRID PER RUN OF CARDS THAT SHARE A HEIGHT. This is the fix for the blank
// areas, and it replaces a single grid holding every card at once.
//
// WHY THE OLD ONE COULD NOT WORK. A CSS grid row is as tall as its tallest
// item, so mixing card kinds in one grid forces the short ones to match the
// tall ones. The cards on this board are not the same size and cannot be made
// so: a CPA coffee card carries a name, a price and a unit, while a mandi
// pepper card also carries a yard name, a usual price and its own date and
// source block, which is three lines more. At three columns and seven cards
// that put Robusta Cherry in the same row as two pepper cards, and it grew a
// large blank area under its number to match them. That is the exact fault this
// board was reported for.
//
// The previous attempts are recorded because both were tried and both failed.
// items-start let each card keep its own height and stopped the cards ending on
// a common line, so a short card left dead space under it inside its own row.
// items-stretch plus mt-auto pushed each card's date block to its bottom edge,
// which moved the blank area from under the block to above it and improved the
// look without removing it. Neither addressed the cause, which is that unlike
// cards were sharing a row at all.
//
// So they no longer do. The board splits its cards into runs of neighbours that
// use the same component, and gives each run its own grid. Every row inside a
// grid then holds one kind of card, stretching costs nothing, and there is no
// blank area to push anywhere.
//
// ORDER IS UNTOUCHED BY THIS. The runs are contiguous slices of the same
// ordered list in the same order, so the cards appear in exactly the catalogue
// sequence they did before: the four coffee crops, then pepper, then cardamom.
// Coffee keeps its order because nothing reorders anything.
//
// A masonry column flow was the other option offered and was rejected. CSS
// multi-column fills top to bottom and then across, so at three columns the
// first line of the screen would read Arabica Parchment, Robusta Cherry,
// Pepper. The crops would be in order down each column and in the wrong order
// across the screen, which is a reordering by any reading a farmer would give
// it.

// The one gap value on this board, used both inside each grid and between the
// grids, so the cards stay evenly spaced across the seam where a run ends.
const BOARD_GAP = "gap-2.5";

const GRID_BASE = `grid items-stretch ${BOARD_GAP}`;

// The skeleton's shape while the queries are in flight. It stands for the six
// catalogue crops, which is what the board shows on an ordinary day before
// pepper expands, so the layout does not lurch when the data lands.
const LOADING_GRID = `${GRID_BASE} grid-cols-2 sm:grid-cols-3`;

// The card kinds that carry their own date and source block and therefore stand
// far taller than a CPA card. Written as the set of tall kinds rather than a
// height in pixels: the height is a consequence of what the card has to say,
// and a measured number would go stale the first time a card gained a line.
const TALL_KINDS = new Set([KIND_MANDI, KIND_AUCTION]);

// The entries split into contiguous runs of the same height class.
//
// Contiguous, never gathered: two runs of CPA cards separated by a mandi card
// stay two runs. Gathering them would move a card past another card, and the
// order on this board is the catalogue's, not ours to rearrange.
function runsByCardHeight(entries) {
  const runs = [];
  for (const entry of entries) {
    const tall = TALL_KINDS.has(entry.kind);
    const current = runs[runs.length - 1];
    if (current && current.tall === tall) current.entries.push(entry);
    else runs.push({ tall, entries: [entry] });
  }
  return runs;
}

// The column shape for a run, chosen from how many cards it holds so the rows
// come out full at 360, 768 and 1280 rather than leaving a card alone with
// empty cells beside it.
//
//   1  one column, so the single card fills its row instead of sitting in half
//      of one with nothing beside it
//   2  two columns at every width, which divides exactly
//   4  two columns on a phone and four from sm, both of which divide exactly.
//      This is the ordinary coffee run, and it is why Robusta Cherry no longer
//      has anything tall beside it
//   otherwise  two columns then three, the board's old shape, with the span
//      rule below widening a last card that would otherwise be stranded
//
// spanAware says whether that span rule may be applied. It must not be applied
// to the four card shape: four leaves a remainder of one against three columns,
// so the rule would emit sm:col-span-3 into a four column grid and make the
// last card three quarters of a row wide for no reason.
function gridShapeFor(count) {
  if (count <= 1) return { cols: "grid-cols-1", spanAware: false };
  if (count === 2) return { cols: "grid-cols-2", spanAware: false };
  if (count === 4) return { cols: "grid-cols-2 sm:grid-cols-4", spanAware: false };
  return { cols: "grid-cols-2 sm:grid-cols-3", spanAware: true };
}

// The last card widens to fill its row when it would otherwise sit alone.
//
// Only reached on the two-then-three shape. Asked per breakpoint because the
// column count changes: alone at two columns means an odd total, alone at three
// means a total leaving a remainder of one. A remainder of two at three columns
// puts two cards on the last row, which is a pair rather than a stranded card,
// so it is left as it is.
//
// sm:col-span-1 is stated on the other branch rather than left off, because
// col-span-2 would otherwise carry into the three column layout and make the
// last card double width for no reason.
//
// The arecanut card is not counted here. It is not in any grid: it is a full
// width block between the runs, so it neither strands nor is stranded.
function spanClassFor(index, total) {
  if (index !== total - 1) return "";
  const aloneAtTwo = total % 2 === 1;
  const aloneAtThree = total % 3 === 1;
  const wide = aloneAtTwo ? "col-span-2" : "";
  return `${wide} ${aloneAtThree ? "sm:col-span-3" : "sm:col-span-1"}`.trim();
}

export function TodaysRatesBoard() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const snapshotsQ = useMarketSnapshots();
  const auctionQ = useCardamomAuction();
  const mandiQ = useMandiPrices();

  const rows = snapshotsQ.data;
  const auctionRow = latestAuctionRow(auctionQ.data);
  const pepperRows = pepperMarketRows(mandiQ.data);
  const arecanut = arecanutRows(mandiQ.data);
  const entries = rows
    ? boardEntriesInOrder(rows, auctionRow, pepperRows, t)
    : [];

  // Only the CPA cards are candidates for the one shared line beneath the
  // board. The auction card prints its own.
  const shared = sharedProvenance(entries.filter((e) => e.kind === KIND_CPA));
  const hasAuction = entries.some((e) => e.kind === KIND_AUCTION);

  // The auction and market yard queries are allowed to fail on their own. A
  // board that refused to render because one of three sources was unreachable
  // would be worse than a board showing the CPA figure, which is exactly what
  // the two fallbacks in boardEntriesInOrder are for. Only the snapshots query,
  // which every card depends on, can put the section into its error state.
  const isLoading =
    snapshotsQ.isLoading || auctionQ.isLoading || mandiQ.isLoading;

  // The calculator sits above the board's shared date and source line, which is
  // what covers the total it works out. That line only speaks for the cards it
  // was computed from, so any crop it does not speak for has to carry its own
  // date and source next to the total instead. Two cases: the auction card,
  // which never joins the shared line, and every card when the CPA rows have
  // fallen out of step and there is no shared line at all.
  //
  // An entry whose card has withdrawn its price is left out entirely. The
  // calculator multiplies a rate by a quantity, so offering a crop whose rate
  // is no longer on screen would put the withdrawn figure back in front of the
  // reader as a total, which is the one thing the cutoff exists to stop.
  const calcEntries = entries
    .filter((entry) => !entry.priceHidden)
    .map((entry) => ({
      ...entry,
      // Any card that is not a CPA card is outside what the shared line speaks
      // for, so it carries its own. Written as "not CPA" rather than a list of
      // the other kinds, so a fourth source added later cannot quietly inherit
      // a caption that was never true of it.
      ownProvenance: entry.kind !== KIND_CPA || !shared,
    }));

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
          <Explainer
            bodyKey="market.explain.cpa"
            extra={explainerNotes(entries, hasAuction, t)}
          />
        </div>
        <p className="mt-1.5 text-sm text-ink-500">{t("market.intro")}</p>
      </motion.div>

      <div className="mt-3">
        {isLoading ? (
          <div className={LOADING_GRID} aria-label={t("market.loading")} data-state="loading">
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
            {/* The outer block is the stagger parent, so the cards still arrive
                one after another across the several grids rather than each grid
                starting its own sequence. Its own gap matches the gap inside
                the grids, so the seam between two runs is invisible. */}
            <motion.div className={`flex flex-col ${BOARD_GAP}`} variants={m.stagger}>
              {runsByCardHeight(entries).map((run) => {
                const shape = gridShapeFor(run.entries.length);
                return (
                  <motion.div
                    // The first card's key names the run. Every crop_key on the
                    // board is unique, so no two runs can collide, and the key
                    // moves with the card rather than being a bare index that
                    // would re-use a slot when a run appears or vanishes.
                    key={run.entries[0].cropKey}
                    className={`${GRID_BASE} ${shape.cols}`}
                    variants={m.stagger}
                  >
                    {run.entries.map(({ cropKey, row, kind, nameKey }, i) => {
                      // Computed once per card and handed to whichever
                      // component renders it, so the stranding rule lives in
                      // one place rather than in three card files that would
                      // have to agree. Counted within the run, because the run
                      // is the grid.
                      const span = shape.spanAware
                        ? spanClassFor(i, run.entries.length)
                        : "";
                      if (kind === KIND_AUCTION) {
                        return (
                          <CardamomAuctionRow
                            key={cropKey}
                            row={row}
                            nameKey={nameKey}
                            className={span}
                          />
                        );
                      }
                      if (kind === KIND_MANDI) {
                        return (
                          <MandiPepperRow
                            key={cropKey}
                            row={row}
                            nameKey={nameKey}
                            className={span}
                          />
                        );
                      }
                      return (
                        <MarketPriceRow
                          key={cropKey}
                          row={row}
                          nameKey={nameKey}
                          className={span}
                          // Only when the CPA rows disagree about their date.
                          // See sharedProvenance above.
                          showProvenance={!shared}
                        />
                      );
                    })}
                  </motion.div>
                );
              })}

              {/* With the crops, full width, in its own block rather than in a
                  grid. It sat below the calculator and the board's date line
                  until it was found that nobody scrolled that far, which on a
                  phone is most of a screen past the rates. A crop from the next
                  district still has to be met while a farmer is reading today's
                  prices. It renders nothing on a day the bordering district
                  published no arecanut. */}
              <ArecanutMandiCard rows={arecanut}/>
            </motion.div>

            {/* Sits between the rates and their provenance on purpose, so the
                board's date and source below cover the multiplied total as
                well as the six rates it was worked out from. */}
            <QuantityCalculator entries={calcEntries}/>

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

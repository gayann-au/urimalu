import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LoadError } from "../../components/ui/LoadError";
import { formatLongDate } from "../../lib/constants";
import { useUriMotion } from "../../lib/uiMotion";
import { useMarketSnapshots, curveRowsForCrop } from "./useMarketSnapshots";
import {
  canRenderPrice,
  priceTextFor,
  UnitLine,
  FlaggedNote,
  storedUnitNote,
} from "./MarketPriceRow";
import { DataAgeLine } from "./DataAgeLine";
import { useUsdInr } from "./useUsdInr";
import { useExplainer, ExplainerButton, ExplainerPanel } from "./Explainer";
import { SectionEyebrow } from "./SectionEyebrow";

// SECTION C. The world numbers. Smaller than the two above it, and last.
//
// Order and size are the argument here. A Kodagu farmer is not paid in US
// cents, so these come after the rates they are actually paid and after the
// weather on their own land, and the section heading is set smaller so the
// page does not read as though London matters more than the CPA sheet does.
//
// ONE UNBROKEN GRID. All three cards sit in a single grid with nothing
// between them. An earlier version pulled the two Coffee Board cards' shared
// date and source out into a band between the rows, which saved a few lines
// of repetition and cost the layout its shape: the band ended the first row,
// so the dollar card started a new one on its own with dead space beside it.
// Each card carries its own provenance inside it now. The two Coffee Board
// cards repeating one source and one date is a small redundancy; an orphaned
// card is a broken grid.
//
// NO COLOUR MARKS THE LEAD CARD. London Robusta had a chilli rule along its
// top edge. A red bar across the top of a price card reads as a warning about
// that price, which is exactly the reading this feature exists to prevent, so
// it is gone. Robusta leads by position: it is first in the grid, because it
// is what Kodagu grows. Nothing else sets it apart, and nothing needs to.

const CROP_LIFFE_ROBUSTA = "liffe_robusta";
const CROP_ICE_ARABICA = "ice_arabica";

// Two across on a phone, matching TodaysRatesBoard, and three across from sm
// so all three benchmarks sit on one row on a tablet or a desktop.
const BENCH_GRID = "grid grid-cols-2 gap-2.5 sm:grid-cols-3";

// The last card fills the row when there is an odd number of them, so a lone
// trailing card is never stranded beside dead space at phone width. From sm
// the grid is three wide and the natural placement is already right.
function spanClassFor(index, total) {
  const isLastAndOdd = index === total - 1 && total % 2 === 1;
  return isLastAndOdd ? "col-span-2 sm:col-span-1" : "";
}

// The nearest contract month for a futures crop, or null.
//
// curveRowsForCrop already sorts by real calendar order through
// contractMonthOrder, so the front month is simply the first entry. Sorting the
// labels as strings would give Dec before Mar before Sept and put the wrong
// contract at the top of this section.
function frontMonthRow(rows, cropKey) {
  const curve = curveRowsForCrop(rows, cropKey);
  const first = curve[0] ?? null;
  return canRenderPrice(first) ? first : null;
}

// The shared shell every card in this section uses, so the three cannot drift
// apart. No accent bar, no tinted edge, no border colour that varies by card.
function BenchCard({ className = "", children }) {
  const m = useUriMotion();
  return (
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      className={`rounded-[14px] border border-ink-100 bg-white p-3.5 shadow-uri-sm ${className}`}
    >
      {children}
    </motion.article>
  );
}

// The label and the question mark, on one line above the number. Identical in
// all three cards.
function BenchHead({ titleKey, subtitle, explainer }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <h3 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-ink-500 break-words">
          {t(titleKey)}
        </h3>
        {subtitle && (
          <p className="mt-0.5 text-[11px] leading-tight text-ink-500">{subtitle}</p>
        )}
      </div>
      <ExplainerButton {...explainer}/>
    </div>
  );
}

function BenchmarkCard({ row, titleKey, explainKey, className }) {
  const { t } = useTranslation();
  const explainer = useExplainer();

  return (
    <BenchCard className={className}>
      <BenchHead
        titleKey={titleKey}
        // contract_month is free text from the source, rendered as stored. It
        // is an exchange's own label for a delivery month and translating it
        // would mean inventing a Kannada month name the exchange does not use.
        subtitle={row.contract_month ? t("market.world.delivery", { month: row.contract_month }) : null}
        explainer={explainer}
      />

      {/* THE NUMBER DOMINATES. Same size and same face as a board card, so a
          reader moving down the page meets one kind of figure, not two. */}
      <p className="mt-1.5 font-display text-[22px] font-extrabold leading-[1.15] tracking-tight text-ink-900 tabular-nums break-words">
        {priceTextFor(row, t)}
      </p>

      <UnitLine unit={row.unit}/>
      <FlaggedNote row={row}/>

      {/* Opens below the number it explains, not above it. */}
      <ExplainerPanel
        {...explainer}
        bodyKey={explainKey}
        extra={storedUnitNote(row.unit, t)}
      />

      {/* This card's own date and source, inside this card. */}
      <DataAgeLine
        sourceDate={row.source_date}
        sourceKey={row.source}
        fetchedAt={row.fetched_at}
      />
    </BenchCard>
  );
}

// Two decimals, which is how a currency rate is quoted and how much precision
// the provider publishes that a reader can use. Not routed through
// formatMarketPrice: that switches on a stored market_snapshots unit token and
// this number has none, because it is not a market row.
function formatRate(rate) {
  return Number(rate).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// The dollar to rupee rate. Its own query, so a failure here leaves the two
// coffee benchmarks beside it standing, and its own provenance inside the
// card, because it comes from a different provider on a different day.
function UsdInrCard({ className }) {
  const { t } = useTranslation();
  const explainer = useExplainer();
  const fxQ = useUsdInr();

  if (fxQ.isLoading) {
    return (
      <div
        className={`h-44 animate-pulse rounded-[14px] border border-ink-200 bg-paper-2 ${className}`}
        aria-label={t("market.fx.loading")}
        data-state="loading"
      />
    );
  }

  // A failed rate is one missing number, not a broken section. It says so in
  // words and offers the retry, rather than leaving a gap.
  if (fxQ.isError || !fxQ.data) {
    return (
      <BenchCard className={className}>
        <h3 className="text-[11px] font-bold uppercase leading-tight tracking-wide text-ink-500">
          {t("market.fx.title")}
        </h3>
        <p className="mt-1.5 text-sm text-ink-500">{t("market.fx.unavailable")}</p>
        <button
          type="button"
          onClick={() => fxQ.refetch()}
          className="mt-2 inline-flex min-h-[44px] items-center rounded-[12px] border-2 border-chilli-600 bg-white px-3 text-xs font-bold text-chilli-700 transition-colors hover:bg-chilli-50"
        >
          {t("common.retry")}
        </button>
      </BenchCard>
    );
  }

  const { rate, updatedMs } = fxQ.data;
  // The provider's instant, turned into the reader's local calendar day.
  // time_last_update_unix is a real timestamp, so it is parsed as one, which is
  // the opposite of how source_date on a market row must be handled.
  const localDay = updatedMs != null ? new Date(updatedMs) : null;
  const localIsoDay = localDay
    ? `${localDay.getFullYear()}-${String(localDay.getMonth() + 1).padStart(2, "0")}-${String(localDay.getDate()).padStart(2, "0")}`
    : null;

  return (
    <BenchCard className={className}>
      <BenchHead titleKey="market.fx.title" explainer={explainer}/>

      <p className="mt-1.5 font-display text-[22px] font-extrabold leading-[1.15] tracking-tight text-ink-900 tabular-nums break-words">
        {formatRate(rate)}
      </p>
      <p className="mt-1.5 text-xs text-ink-600">{t("market.fx.unit")}</p>

      <ExplainerPanel {...explainer} bodyKey="market.explain.usdInr"/>

      {/* Not from our database and not from a body DataAgeLine knows how to
          name, so it states its own date and its own source here. */}
      <div className="mt-2 space-y-0.5">
        {localIsoDay && (
          <p className="text-xs text-ink-500">
            {t("market.fx.updated", { date: formatLongDate(localIsoDay) })}
          </p>
        )}
        <p className="text-xs text-ink-500">{t("market.fx.source")}</p>
      </div>
    </BenchCard>
  );
}

export function GlobalBenchmarks() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const snapshotsQ = useMarketSnapshots();

  const rows = snapshotsQ.data;
  const robusta = rows ? frontMonthRow(rows, CROP_LIFFE_ROBUSTA) : null;
  const arabica = rows ? frontMonthRow(rows, CROP_ICE_ARABICA) : null;

  const showLoading = snapshotsQ.isLoading;
  const showError = !showLoading && snapshotsQ.isError;
  const showEmpty = !showLoading && !showError && !robusta && !arabica;

  // The grid's contents, assembled before rendering so the span rule can see
  // how many cards there actually are. Robusta first: that position is the
  // only thing marking it as the one Kodagu tracks.
  const cards = [];
  if (robusta) {
    cards.push({
      key: "robusta",
      render: (className) => (
        <BenchmarkCard
          row={robusta}
          titleKey="market.world.londonRobusta"
          explainKey="market.explain.londonRobusta"
          className={className}
        />
      ),
    });
  }
  if (arabica) {
    cards.push({
      key: "arabica",
      render: (className) => (
        <BenchmarkCard
          row={arabica}
          titleKey="market.world.iceArabica"
          explainKey="market.explain.iceArabica"
          className={className}
        />
      ),
    });
  }
  // Always present, whatever the database did. Its own query, its own states.
  cards.push({ key: "fx", render: (className) => <UsdInrCard className={className}/> });

  return (
    <motion.section
      className="mt-9"
      aria-label={t("market.world.heading")}
      variants={m.stagger}
      initial="hidden"
      // animate, not whileInView. See the long note in WeatherByTown.jsx: a
      // one-shot in-view trigger left this whole section at opacity 0 while
      // holding its height, which reads as a broken app.
      animate="show"
    >
      <motion.div variants={m.fadeUp}>
        <SectionEyebrow labelKey="market.world.eyebrow"/>
        {/* Set smaller than the two headings above it. This section is last
            and quietest by design. */}
        <h2 className="mt-1.5 font-display text-xl font-extrabold leading-tight tracking-tight text-ink-900">
          {t("market.world.heading")}
        </h2>
        <p className="mt-1.5 text-sm text-ink-500">{t("market.world.intro")}</p>
      </motion.div>

      {/* The failure and empty notices sit above the grid rather than inside
          it, so they never take a cell and never break the run of cards. */}
      {showError && (
        <div className="mt-3" data-state="error">
          <LoadError onRetry={() => snapshotsQ.refetch()}/>
        </div>
      )}
      {showEmpty && (
        <div
          className="mt-3 rounded-[14px] border border-ink-100 bg-white p-5 text-sm text-ink-500 shadow-uri-sm"
          data-state="empty"
        >
          {t("market.world.empty")}
        </div>
      )}

      {/* ONE GRID, NOTHING BETWEEN THE CARDS. */}
      <motion.div
        className={`mt-3 ${BENCH_GRID}`}
        variants={m.stagger}
        data-state={showLoading ? "loading" : "populated"}
      >
        {showLoading ? (
          <>
            <div className="h-44 animate-pulse rounded-[14px] border border-ink-200 bg-paper-2"/>
            <div className="h-44 animate-pulse rounded-[14px] border border-ink-200 bg-paper-2"/>
            <UsdInrCard className={spanClassFor(2, 3)}/>
          </>
        ) : (
          cards.map((card, i) => (
            <div key={card.key} className="contents">
              {card.render(spanClassFor(i, cards.length))}
            </div>
          ))
        )}
      </motion.div>
    </motion.section>
  );
}

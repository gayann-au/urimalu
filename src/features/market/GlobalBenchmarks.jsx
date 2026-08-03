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
// THE CARDS ARE THE SAME OBJECT AS THE BOARD'S. They were full width blocks
// that ran title, contract month, a three line paragraph, and only then the
// number, which left the explanation sitting above the thing it explained and
// the figure as the smallest element on the card. They are now the same
// compact card in the same two column grid as Today's rates: label, number,
// unit, with the explanation collapsed behind the question mark and opening
// underneath the number it describes.

const CROP_LIFFE_ROBUSTA = "liffe_robusta";
const CROP_ICE_ARABICA = "ice_arabica";

// Same grid as TodaysRatesBoard, deliberately. The two sections are the same
// kind of thing and had stopped looking like it.
const BENCH_GRID = "grid grid-cols-2 gap-2.5";

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

// Whether one line can honestly caption both coffee benchmarks, so two compact
// cards do not each carry three lines of provenance.
//
// Checked, never assumed, exactly as the board does it: same source and same
// source_date or nothing. fetched_at is the older of the two, because "we last
// checked" has to be true of both numbers above it.
function sharedProvenance(rows) {
  const present = rows.filter(Boolean);
  if (present.length === 0) return null;

  const first = present[0];
  let oldestFetchedAt = first.fetched_at;
  for (const row of present) {
    if (row.source !== first.source) return null;
    if (row.source_date !== first.source_date) return null;
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

// The shared shell every card in this section uses, so the three cannot drift
// apart. isLead adds the chilli rule along the top edge: an edge accent
// marking which one reads first, nowhere near the figure, saying "this one
// first" and never "this price is good".
function BenchCard({ isLead = false, children }) {
  const m = useUriMotion();
  return (
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      className="overflow-hidden rounded-[14px] border border-ink-100 bg-white shadow-uri-sm"
    >
      {isLead && <div aria-hidden="true" className="h-[3px] bg-chilli-500"/>}
      <div className="p-3.5">{children}</div>
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

function BenchmarkCard({ row, titleKey, explainKey, isLead }) {
  const { t } = useTranslation();
  const explainer = useExplainer();

  return (
    <BenchCard isLead={isLead}>
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
// card, because it comes from a different provider on a different day than
// they do.
function UsdInrCard() {
  const { t } = useTranslation();
  const explainer = useExplainer();
  const fxQ = useUsdInr();

  if (fxQ.isLoading) {
    return (
      <div
        className="h-40 animate-pulse rounded-[14px] border border-ink-200 bg-paper-2"
        aria-label={t("market.fx.loading")}
        data-state="loading"
      />
    );
  }

  // A failed rate is one missing number, not a broken section. It says so in
  // words and offers the retry, rather than leaving a gap.
  if (fxQ.isError || !fxQ.data) {
    return (
      <BenchCard>
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
    <BenchCard>
      <BenchHead titleKey="market.fx.title" explainer={explainer}/>

      <p className="mt-1.5 font-display text-[22px] font-extrabold leading-[1.15] tracking-tight text-ink-900 tabular-nums break-words">
        {formatRate(rate)}
      </p>
      <p className="mt-1.5 text-xs text-ink-600">{t("market.fx.unit")}</p>

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

      <ExplainerPanel {...explainer} bodyKey="market.explain.usdInr"/>
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
  const shared = sharedProvenance([robusta, arabica]);

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

      <div className="mt-3">
        {snapshotsQ.isLoading ? (
          <div data-state="loading">
            <p className="mb-2 text-sm text-ink-500">{t("market.loading")}</p>
            <div className={BENCH_GRID}>
              <div className="h-40 animate-pulse rounded-[14px] border border-ink-200 bg-paper-2"/>
              <div className="h-40 animate-pulse rounded-[14px] border border-ink-200 bg-paper-2"/>
            </div>
          </div>
        ) : snapshotsQ.isError ? (
          <div data-state="error">
            <LoadError onRetry={() => snapshotsQ.refetch()}/>
          </div>
        ) : !robusta && !arabica ? (
          <div
            className="rounded-[14px] border border-ink-100 bg-white p-5 text-sm text-ink-500 shadow-uri-sm"
            data-state="empty"
          >
            {t("market.world.empty")}
          </div>
        ) : (
          <div data-state="populated">
            {/* London first and marked by the chilli edge, Arabica beside it.
                Each is dropped on its own when its row cannot state a date and
                a source, so a missing Arabica does not take Robusta down. */}
            <motion.div className={BENCH_GRID} variants={m.stagger}>
              {robusta && (
                <BenchmarkCard
                  row={robusta}
                  titleKey="market.world.londonRobusta"
                  explainKey="market.explain.londonRobusta"
                  isLead
                />
              )}
              {arabica && (
                <BenchmarkCard
                  row={arabica}
                  titleKey="market.world.iceArabica"
                  explainKey="market.explain.iceArabica"
                />
              )}
            </motion.div>

            {/* One line for both coffee cards when they genuinely agree, which
                keeps them compact. Falls back to a line per card when they do
                not. */}
            {shared ? (
              <motion.div variants={m.fadeUp}>
                <DataAgeLine
                  sourceDate={shared.sourceDate}
                  sourceKey={shared.sourceKey}
                  fetchedAt={shared.fetchedAt}
                />
              </motion.div>
            ) : (
              <motion.div variants={m.fadeUp} className="mt-1 space-y-1">
                {[robusta, arabica].filter(Boolean).map((row) => (
                  <DataAgeLine
                    key={row.crop_key}
                    sourceDate={row.source_date}
                    sourceKey={row.source}
                    fetchedAt={row.fetched_at}
                  />
                ))}
              </motion.div>
            )}
          </div>
        )}

        {/* Outside the snapshot branch entirely, because it is a different
            query with a different provider. The database being down has
            nothing to say about whether the dollar rate loaded. */}
        <motion.div className={`${BENCH_GRID} mt-3`} variants={m.stagger}>
          <UsdInrCard/>
        </motion.div>
      </div>
    </motion.section>
  );
}

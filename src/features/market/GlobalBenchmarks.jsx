import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LoadError } from "../../components/ui/LoadError";
import { formatLongDate } from "../../lib/constants";
import { useUriMotion } from "../../lib/uiMotion";
import { useMarketSnapshots, curveRowsForCrop } from "./useMarketSnapshots";
import { canRenderPrice, priceTextFor, UnitLine, FlaggedNote } from "./MarketPriceRow";
import { DataAgeLine } from "./DataAgeLine";
import { useUsdInr } from "./useUsdInr";
import { Explainer } from "./Explainer";
import { SectionEyebrow } from "./SectionEyebrow";

// SECTION C. The world numbers. Smaller than the two above it, and last.
//
// Order and size are the argument here. A Kodagu farmer is not paid in US
// cents, so these come after the rates they are actually paid and after the
// weather on their own land, and they are set smaller so the page does not
// read as though London matters more than the CPA sheet does.
//
// Within the section London Robusta is first and largest, because Robusta is
// what Kodagu grows and the London contract is the benchmark the district
// tracks. Arabica and the dollar rate follow it.
//
// These carry their own dates, and that is worth seeing next to Section A. The
// Coffee Board rows are days old where the CPA sheet is weeks old, and putting
// both on one page with both dates visible is the honest way to show it. No
// text anywhere compares them or draws a conclusion from the gap.

const CROP_LIFFE_ROBUSTA = "liffe_robusta";
const CROP_ICE_ARABICA = "ice_arabica";

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

// One exchange benchmark: name, delivery month, price, unit, date, source.
//
// size "lead" is London Robusta, "quiet" is Arabica. The difference is the type
// scale and a chilli rule along the top edge. No colour touches the figure
// itself and neither card is marked as the one to watch beyond the order they
// sit in.
function BenchmarkCard({ row, titleKey, explainKey, size }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const isLead = size === "lead";

  return (
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      className="overflow-hidden rounded-[18px] border border-ink-100 bg-white shadow-uri-md"
    >
      {/* The chilli rule is an edge accent marking the lead card of the
          section. It is a 3px line at the top of the card, nowhere near the
          figure, and it says "this one first", never "this price is good". */}
      {isLead && <div aria-hidden="true" className="h-[3px] bg-chilli-500"/>}

      <div className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-3">
          <div className="min-w-0">
            <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
              {t(titleKey)}
            </h3>
            {/* contract_month is free text from the source, rendered as
                stored. It is an exchange's own label for a delivery month and
                translating it would mean inventing a Kannada month name the
                exchange does not use. */}
            {row.contract_month && (
              <p className="mt-0.5 text-xs text-ink-500">
                {t("market.world.delivery", { month: row.contract_month })}
              </p>
            )}
          </div>
          <Explainer bodyKey={explainKey}/>
        </div>

        <p
          className={`mt-2.5 font-display font-extrabold leading-none tracking-tight text-ink-900 tabular-nums break-words ${
            isLead ? "text-[38px]" : "text-3xl"
          }`}
        >
          {priceTextFor(row, t)}
        </p>

        <UnitLine unit={row.unit}/>
        <FlaggedNote row={row}/>

        {/* Its own date and its own source, not the section's. This is the
            contrast the section exists to make visible. */}
        <DataAgeLine
          sourceDate={row.source_date}
          sourceKey={row.source}
          fetchedAt={row.fetched_at}
        />
      </div>
    </motion.article>
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
// coffee benchmarks beside it standing.
function UsdInrCard() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const fxQ = useUsdInr();

  if (fxQ.isLoading) {
    return (
      <div
        className="h-44 animate-pulse rounded-[18px] border border-ink-100 bg-white shadow-uri-md"
        aria-label={t("market.fx.loading")}
        data-state="loading"
      />
    );
  }

  // A failed rate is one missing number, not a broken section. It says so in
  // one quiet line and offers the retry, rather than taking the LoadError card
  // and shouting louder than the benchmarks that did load.
  if (fxQ.isError || !fxQ.data) {
    return (
      <article
        className="rounded-[18px] border border-ink-100 bg-white p-5 shadow-uri-md"
        data-state="error"
      >
        <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
          {t("market.fx.title")}
        </h3>
        <p className="mt-2 text-sm text-ink-500">{t("market.fx.unavailable")}</p>
        <button
          type="button"
          onClick={() => fxQ.refetch()}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-[14px] border-2 border-chilli-600 bg-white px-4 text-sm font-bold text-chilli-700 transition-colors hover:bg-chilli-50"
        >
          {t("common.retry")}
        </button>
      </article>
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
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      className="rounded-[18px] border border-ink-100 bg-white p-5 shadow-uri-md"
      data-state="populated"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-3">
        <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
          {t("market.fx.title")}
        </h3>
        <Explainer bodyKey="market.explain.usdInr"/>
      </div>

      <p className="mt-2.5 font-display text-3xl font-extrabold leading-none tracking-tight text-ink-900 tabular-nums break-words">
        {formatRate(rate)}
      </p>
      <p className="mt-1.5 text-xs text-ink-600">{t("market.fx.unit")}</p>

      {/* This number is not from our database and not from a body DataAgeLine
          knows how to name, so it states its own date and its own source here
          rather than borrowing that component.
          The provider's raw RFC 1123 stamp used to print underneath. It is
          gone: "Mon, 03 Aug 2026 00:02:32 +0000" is a machine's way of writing
          a date and this feature is read by farmers with limited schooling.
          The same instant now renders as one plain sentence. */}
      <div className="mt-3 space-y-0.5">
        {localIsoDay && (
          <p className="text-sm text-ink-500">
            {t("market.fx.updated", { date: formatLongDate(localIsoDay) })}
          </p>
        )}
        <p className="text-sm text-ink-500">{t("market.fx.source")}</p>
      </div>
    </motion.article>
  );
}

export function GlobalBenchmarks() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const snapshotsQ = useMarketSnapshots();

  const rows = snapshotsQ.data;
  const robusta = rows ? frontMonthRow(rows, CROP_LIFFE_ROBUSTA) : null;
  const arabica = rows ? frontMonthRow(rows, CROP_ICE_ARABICA) : null;

  return (
    <motion.section
      className="mt-9"
      aria-label={t("market.world.heading")}
      variants={m.stagger}
      initial="hidden"
      whileInView="show"
      viewport={m.inView}
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

      <div className="mt-3 space-y-3">
        {snapshotsQ.isLoading ? (
          <div className="space-y-3" aria-label={t("market.loading")} data-state="loading">
            <div className="h-52 animate-pulse rounded-[18px] border border-ink-100 bg-white shadow-uri-md"/>
            <div className="h-44 animate-pulse rounded-[18px] border border-ink-100 bg-white shadow-uri-md"/>
          </div>
        ) : snapshotsQ.isError ? (
          <div data-state="error">
            <LoadError onRetry={() => snapshotsQ.refetch()}/>
          </div>
        ) : !robusta && !arabica ? (
          <div
            className="rounded-[18px] border border-ink-100 bg-white p-6 text-sm text-ink-500 shadow-uri-sm"
            data-state="empty"
          >
            {t("market.world.empty")}
          </div>
        ) : (
          <div className="space-y-3" data-state="populated">
            {/* London first and largest. Each card is dropped on its own when
                its row cannot state a date and a source, so a missing Arabica
                row does not take Robusta down with it. */}
            {robusta && (
              <BenchmarkCard
                row={robusta}
                titleKey="market.world.londonRobusta"
                explainKey="market.explain.londonRobusta"
                size="lead"
              />
            )}
            {arabica && (
              <BenchmarkCard
                row={arabica}
                titleKey="market.world.iceArabica"
                explainKey="market.explain.iceArabica"
                size="quiet"
              />
            )}
          </div>
        )}

        {/* Outside the snapshot branch entirely, because it is a different
            query with a different provider. The database being down has
            nothing to say about whether the dollar rate loaded. */}
        <UsdInrCard/>
      </div>
    </motion.section>
  );
}

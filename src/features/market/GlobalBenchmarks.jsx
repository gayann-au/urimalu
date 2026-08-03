import { useTranslation } from "react-i18next";
import { LoadError } from "../../components/ui/LoadError";
import { formatValidTill } from "../../lib/constants";
import { useMarketSnapshots, curveRowsForCrop } from "./useMarketSnapshots";
import { canRenderPrice, priceTextFor, UnitLine, FlaggedNote } from "./MarketPriceRow";
import { DataAgeLine } from "./DataAgeLine";
import { useUsdInr } from "./useUsdInr";

// SECTION C. The world numbers. Smaller than the two above it, and last.
//
// Order and size are the argument here. A Kodagu farmer is not paid in US
// cents, so these come after the rates they are actually paid and after the
// weather on their own land, and they are set smaller so the page does not
// read as though London matters more than the CPA sheet does.
//
// Within the section London Robusta is first and slightly larger, because
// Robusta is what Kodagu grows and the London contract is the benchmark the
// district tracks. Arabica and the dollar rate follow it.
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
// size "lead" is London Robusta, "quiet" is Arabica. The only difference is the
// type scale. No colour separates them and neither is marked as the one to
// watch beyond the order they sit in.
function BenchmarkCard({ row, titleKey, size }) {
  const { t } = useTranslation();
  const isLead = size === "lead";

  return (
    <article className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm">
      <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
        {t(titleKey)}
      </h3>

      {/* contract_month is free text from the source, rendered as stored. It is
          an exchange's own label for a delivery month and translating it would
          mean inventing a Kannada month name the exchange does not use. */}
      {row.contract_month && (
        <p className="mt-0.5 text-xs text-ink-500">
          {t("market.world.delivery", { month: row.contract_month })}
        </p>
      )}

      <p
        className={`mt-2 font-bold leading-tight text-ink-900 tabular-nums break-words ${
          isLead ? "text-3xl" : "text-2xl"
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
    </article>
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
  const fxQ = useUsdInr();

  if (fxQ.isLoading) {
    return (
      <div
        className="h-40 animate-pulse rounded-[18px] border border-ink-200 bg-white shadow-sm"
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
        className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm"
        data-state="error"
      >
        <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
          {t("market.fx.title")}
        </h3>
        <p className="mt-2 text-sm text-ink-500">{t("market.fx.unavailable")}</p>
        <button
          type="button"
          onClick={() => fxQ.refetch()}
          className="mt-3 inline-flex min-h-[44px] items-center justify-center rounded-[14px] border-2 border-coorg-600 bg-white px-4 text-sm font-bold text-coorg-700 transition-colors hover:bg-coorg-50"
        >
          {t("common.retry")}
        </button>
      </article>
    );
  }

  const { rate, updatedUtc, updatedMs } = fxQ.data;
  // The reader's local calendar day for the provider's instant.
  // time_last_update_unix is a real timestamp, so it is parsed as one, which is
  // the opposite of how source_date on a market row must be handled.
  const localDay = updatedMs != null ? new Date(updatedMs) : null;
  const localIsoDay = localDay
    ? `${localDay.getFullYear()}-${String(localDay.getMonth() + 1).padStart(2, "0")}-${String(localDay.getDate()).padStart(2, "0")}`
    : null;

  return (
    <article
      className="rounded-[18px] border border-ink-200 bg-white p-5 shadow-sm"
      data-state="populated"
    >
      <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
        {t("market.fx.title")}
      </h3>

      <p className="mt-2 text-2xl font-bold leading-tight text-ink-900 tabular-nums break-words">
        {formatRate(rate)}
      </p>
      <p className="mt-1 text-xs text-ink-500">{t("market.fx.unit")}</p>

      {/* This number is not from our database and not from a body DataAgeLine
          knows how to name, so it states its own date and its own source here
          rather than borrowing that component. The provider's raw stamp is
          printed underneath, verbatim, because it is the source's own words
          about when it last looked and reformatting it would make it ours. */}
      <div className="mt-3 space-y-0.5">
        {localIsoDay && (
          <p className="text-sm text-ink-500">
            {t("market.fx.updated", { date: formatValidTill(localIsoDay) })}
          </p>
        )}
        <p className="text-sm text-ink-500">{t("market.fx.source")}</p>
        {updatedUtc && (
          <p className="text-xs text-ink-500 break-words">{updatedUtc}</p>
        )}
      </div>
    </article>
  );
}

export function GlobalBenchmarks() {
  const { t } = useTranslation();
  const snapshotsQ = useMarketSnapshots();

  const rows = snapshotsQ.data;
  const robusta = rows ? frontMonthRow(rows, CROP_LIFFE_ROBUSTA) : null;
  const arabica = rows ? frontMonthRow(rows, CROP_ICE_ARABICA) : null;

  return (
    <section className="mt-8" aria-label={t("market.world.heading")}>
      <h2 className="font-display text-xl font-extrabold tracking-tight text-ink-900">
        {t("market.world.heading")}
      </h2>
      <p className="mt-1 text-sm text-ink-500">{t("market.world.intro")}</p>

      <div className="mt-3 space-y-3">
        {snapshotsQ.isLoading ? (
          <div className="space-y-3" aria-label={t("market.loading")} data-state="loading">
            <div className="h-44 animate-pulse rounded-[18px] border border-ink-200 bg-white shadow-sm"/>
            <div className="h-40 animate-pulse rounded-[18px] border border-ink-200 bg-white shadow-sm"/>
          </div>
        ) : snapshotsQ.isError ? (
          <div data-state="error">
            <LoadError onRetry={() => snapshotsQ.refetch()}/>
          </div>
        ) : !robusta && !arabica ? (
          <div
            className="rounded-[18px] border border-ink-200 bg-white p-6 text-sm text-ink-500 shadow-sm"
            data-state="empty"
          >
            {t("market.world.empty")}
          </div>
        ) : (
          <div className="space-y-3" data-state="populated">
            {/* London first and larger. Each card is dropped on its own when
                its row cannot state a date and a source, so a missing Arabica
                row does not take Robusta down with it. */}
            {robusta && (
              <BenchmarkCard
                row={robusta}
                titleKey="market.world.londonRobusta"
                size="lead"
              />
            )}
            {arabica && (
              <BenchmarkCard
                row={arabica}
                titleKey="market.world.iceArabica"
                size="quiet"
              />
            )}
          </div>
        )}

        {/* Outside the snapshot branch entirely, because it is a different
            query with a different vendor. The database being down has nothing
            to say about whether the dollar rate loaded. */}
        <UsdInrCard/>
      </div>
    </section>
  );
}

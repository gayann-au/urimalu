import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { RateCard } from "./RateCard";
import { useAuth } from "../auth/useAuth";
import { useListings, uniqueCropsInFeed, groupFeedByMerchant } from "./useFeed";
import { LoadError } from "../../components/ui/LoadError";
import { useRealtimeListings } from "../../hooks/useRealtimeListings";
import { useUiStore } from "../../hooks/useUiStore";
import { toast } from "../../components/ui/Toast";
import { useUriMotion } from "../../lib/uiMotion";
import { WELCOME_FLAG_KEY } from "../../lib/constants";
import { ReadyToSellCard } from "../sellerLeads/ReadyToSellCard";

// Storefront glyph, the soft icon that anchors each merchant card the way the
// landing step cards are anchored by their icon boxes.
function StoreIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9 5 4h14l2 5"/>
      <path d="M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z"/>
      <path d="M9 9v3a3 3 0 0 0 6 0V9"/>
    </svg>
  );
}

function Arrow() {
  return (
    <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>
    </svg>
  );
}

// Circular refresh glyph for the "new rates, tap to refresh" banner.
function RefreshIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12a9 9 0 1 1-2.64-6.36"/>
      <path d="M21 3v6h-6"/>
    </svg>
  );
}

export default function FeedPage() {
  const { t } = useTranslation();
  const listingsQ = useListings();
  const items = listingsQ.data || [];
  const { profile } = useAuth();
  const loggedIn = !!profile;
  const [tab, setTab] = useState("merchants");

  // One-time welcome after farmer signup: the signup flows set a sessionStorage
  // flag, the feed shows the toast once and clears it, so a refresh or a later
  // visit never repeats it.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(WELCOME_FLAG_KEY)) {
        sessionStorage.removeItem(WELCOME_FLAG_KEY);
        toast({ text: t("welcome.firstLogin") });
      }
    } catch {}
  }, [t]);

  // Listen for new listings in real time. The hook bumps the store's
  // newRatesCount on each insert and fails silently if the socket drops, so a
  // dropped connection simply shows no banner.
  useRealtimeListings();
  const newRatesCount = useUiStore((s) => s.newRatesCount);
  const clearNewRates = useUiStore((s) => s.clearNewRates);

  // Tapping the banner pulls the latest feed and clears the pending count.
  function refreshNewRates() {
    listingsQ.refetch();
    clearNewRates();
  }

  return (
    <div className="flex flex-col flex-1 pb-12 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8 isolate">
      <GlowBackdrop/>
      <Header/>

      {/* Real time "new rates" banner. Floats below the header and only shows
          when the realtime hook has counted at least one new listing since the
          last refresh. Tapping it refetches the feed and clears the count. */}
      {newRatesCount > 0 && (
        <div className="fixed top-[72px] left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4 flex justify-center pointer-events-none">
          <button
            type="button"
            onClick={refreshNewRates}
            className="pointer-events-auto inline-flex items-center gap-2 min-h-[44px] rounded-full bg-coorg-600 text-white font-bold text-sm px-5 shadow-lg hover:bg-coorg-700 transition-colors"
          >
            <RefreshIcon/>
            {t("feed.newRates", { n: newRatesCount })}
          </button>
        </div>
      )}

      {/* Ready to Sell: farmers only. */}
      {profile?.role === "FARMER" && <ReadyToSellCard profile={profile}/>}

      {/* Tabs */}
      <div className="bg-white border-b border-ink-100 sticky top-[64px] z-20">
        <div className="flex">
          <TabButton active={tab === "merchants"} onClick={() => setTab("merchants")}>
            {t("feed.byMerchant")}
          </TabButton>
          <TabButton active={tab === "crops"} onClick={() => setTab("crops")}>
            {t("feed.byCrop")}
          </TabButton>
        </div>
      </div>

      {tab === "merchants" ? (
        <MerchantsTab items={items} isLoading={listingsQ.isLoading} isError={listingsQ.isError} onRetry={() => listingsQ.refetch()} loggedIn={loggedIn}/>
      ) : (
        <CropsTab items={items} isLoading={listingsQ.isLoading} isError={listingsQ.isError} onRetry={() => listingsQ.refetch()} loggedIn={loggedIn}/>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-h-[48px] px-3 text-sm font-bold border-b-2 transition-colors ${
        active
          ? "border-coorg-600 text-coorg-700"
          : "border-transparent text-ink-500 hover:text-ink-700"
      }`}
    >
      {children}
    </button>
  );
}

// ----- By Merchant tab -----

function MerchantsTab({ items, isLoading, isError, onRetry, loggedIn }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);

  const groups = useMemo(() => groupFeedByMerchant(items), [items]);

  const filtered = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter((g) => {
      const name = (g.merchant.business_name || "").toLowerCase();
      const town = (g.merchant.town || "").toLowerCase();
      return name.includes(q) || town.includes(q);
    });
  }, [groups, deferredSearch]);

  return (
    <>
      <div className="bg-white border-b border-ink-100 px-4 py-3">
        <input
          type="search"
          value={search}
          maxLength={100}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("feed.searchMerchant")}
          className="w-full min-h-[48px] rounded-2xl border-2 border-ink-200 focus:border-coorg-500 outline-none px-4 text-base bg-white"
        />
      </div>

      <main className="flex-1 px-4 py-5">
        {isError ? (
          <LoadError onRetry={onRetry}/>
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-[18px] border border-ink-200 shadow-sm p-7 animate-pulse h-44"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-ink-500 py-16">
            <p>
              {deferredSearch.trim()
                ? t("feed.noMerchantsMatch")
                : t("feed.noMerchantsYet")}
            </p>
          </div>
        ) : (
          <motion.div
            variants={m.stagger}
            initial="hidden"
            whileInView="show"
            viewport={m.inView}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {loggedIn
              ? filtered.map((g) => (
                  <MerchantCard
                    key={g.merchant.id}
                    group={g}
                    onView={() => nav(`/merchant/${g.merchant.id}`)}
                  />
                ))
              : filtered.map((g) => (
                  <MerchantCardGated
                    key={g.merchant.id}
                    group={g}
                    onLogin={() => nav("/login")}
                  />
                ))}
          </motion.div>
        )}
      </main>
    </>
  );
}

function MerchantCard({ group, onView }) {
  const { t, i18n } = useTranslation();
  const m = useUriMotion();
  const { merchant, crop_count, last_confirmed_at } = group;
  const freshLabel = freshnessLabel(last_confirmed_at, t, i18n.language);
  return (
    <motion.article
      variants={m.fadeUp}
      whileHover={m.cardHover}
      className="group bg-white rounded-[18px] border border-ink-200 shadow-sm hover:shadow-md hover:border-crop-200 p-7 transition-colors"
    >
      <span className="h-11 w-11 rounded-[14px] bg-crop-50 text-crop-600 grid place-items-center mb-4">
        <StoreIcon/>
      </span>
      <h3 className="font-display text-xl font-extrabold tracking-tight text-ink-900 leading-tight truncate">
        {merchant.business_name}
      </h3>
      <p className="text-sm text-ink-500 mt-1 truncate">
        {merchant.town}
        {merchant.town && merchant.district ? ", " : ""}
        {merchant.district}
      </p>
      <p className="text-sm font-semibold text-ink-700 mt-3 tabular-nums">
        {crop_count === 1
          ? t("feed.buyingOneCrop")
          : t("feed.buyingNCrops", { count: crop_count })}
      </p>
      <p className="text-xs text-ink-500 mt-1">{freshLabel}</p>
      <button
        type="button"
        onClick={onView}
        className="mt-5 w-full min-h-[48px] rounded-[14px] bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition-colors inline-flex items-center justify-center gap-2"
      >
        {t("feed.viewCropPrices")}
        <Arrow/>
      </button>
    </motion.article>
  );
}

// Logged-out variant: business_name + blurred placeholder teaser + login CTA.
// The placeholder lines are static dummy strings, NOT real merchant data.
// Only business_name is rendered from the group.
function MerchantCardGated({ group, onLogin }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const name = group.merchant.business_name;
  return (
    <motion.article
      variants={m.fadeUp}
      whileHover={m.cardHover}
      className="group bg-white rounded-[18px] border border-ink-200 shadow-sm hover:shadow-md hover:border-crop-200 p-7 transition-colors"
    >
      <span className="h-11 w-11 rounded-[14px] bg-crop-50 text-crop-600 grid place-items-center mb-4">
        <StoreIcon/>
      </span>
      <h3 className="font-display text-xl font-extrabold tracking-tight text-ink-900 leading-tight truncate">
        {name}
      </h3>
      {/* Static placeholders, blurred. No real town/district/count/date here. */}
      <p aria-hidden="true" className="text-sm text-ink-500 mt-1 truncate select-none blur-sm">
        xxxxxxxx, xxxxxxx
      </p>
      <p aria-hidden="true" className="text-sm font-semibold text-ink-700 mt-3 tabular-nums select-none blur-sm">
        Buying x crops today
      </p>
      <p aria-hidden="true" className="text-xs text-ink-500 mt-1 select-none blur-sm">
        Updated xx xxx
      </p>
      <button
        type="button"
        onClick={onLogin}
        className="mt-5 w-full min-h-[48px] rounded-[14px] bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition-colors inline-flex items-center justify-center gap-2"
      >
        {t("feed.loginToSeePrices")}
        <Arrow/>
      </button>
    </motion.article>
  );
}

// ----- By Crop tab -----

function CropsTab({ items, isLoading, isError, onRetry, loggedIn }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [cropChip, setCropChip] = useState(null);
  // Price sort mode for the results list. "mixed" is the default: the feed's
  // original unsorted order. "desc" is High to Low, "asc" is Low to High.
  const [sortDir, setSortDir] = useState("mixed");
  const deferredSearch = useDeferredValue(search);

  const crops = useMemo(() => uniqueCropsInFeed(items), [items]);
  const isFiltered = !!cropChip || deferredSearch.trim().length > 0;

  // Reset the sort back to the default whenever the selected crop changes, so
  // the choice never carries over from one crop to the next. Not persisted.
  useEffect(() => {
    setSortDir("mixed");
  }, [cropChip]);

  // Only build the list when a crop is selected or a search is active.
  // When nothing is selected we show the hint instead of dumping every listing.
  const list = useMemo(() => {
    if (!isFiltered) return [];
    const q = deferredSearch.trim().toLowerCase();
    let out = items;
    if (cropChip) out = out.filter((i) => i.crop_name === cropChip);
    if (q) out = out.filter((i) => (i.crop_name || "").toLowerCase().includes(q));

    // Mixed: the feed's original order, straight out of the filter step. No
    // partition, no sort, so priced and Call-for-Price listings stay
    // interleaved exactly as they were before this sort feature existed.
    if (sortDir === "mixed") return out;

    // Keep Call-for-Price and price-less listings out of the numeric ordering.
    // Sort only the priced listings by the chosen direction (Array.sort is
    // stable, so equal prices keep their existing order), then append the
    // unpriced ones in their existing order so they always trail every priced
    // listing, in both directions.
    const priced = [];
    const unpriced = [];
    for (const i of out) {
      if (numericPrice(i) == null) unpriced.push(i);
      else priced.push(i);
    }
    priced.sort((a, b) =>
      sortDir === "asc"
        ? numericPrice(a) - numericPrice(b)
        : numericPrice(b) - numericPrice(a)
    );
    return [...priced, ...unpriced];
  }, [items, cropChip, deferredSearch, isFiltered, sortDir]);

  function toggleChip(name) {
    setCropChip((c) => (c === name ? null : name));
  }
  function clearAll() {
    setCropChip(null);
    setSearch("");
  }

  // Logged-out: no chips, no list, no search results. Just a login prompt.
  if (!loggedIn) {
    return (
      <main className="flex-1 px-4 py-12">
        <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center max-w-md mx-auto">
          <p className="text-sm text-ink-700">
            {t("feed.loggedOutCropHint")}
          </p>
          <button
            type="button"
            onClick={() => nav("/login")}
            className="group mt-5 w-full min-h-[48px] rounded-[14px] bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition-colors inline-flex items-center justify-center gap-2"
          >
            {t("nav.login")}
            <Arrow/>
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="bg-white border-b border-ink-100">
        <div className="px-4 pt-3">
          <input
            type="search"
            value={search}
            maxLength={100}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("feed.searchCrop")}
            className="w-full min-h-[48px] rounded-2xl border-2 border-ink-200 focus:border-coorg-500 outline-none px-4 text-base bg-white"
          />
        </div>
        {crops.length > 0 && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar scroll-fade-right">
            {crops.map((c) => {
              const active = cropChip === c;
              return (
                <button
                  key={c}
                  onClick={() => toggleChip(c)}
                  className={`whitespace-nowrap rounded-full px-4 min-h-[40px] text-sm font-semibold border-2 transition-colors ${
                    active
                      ? "bg-coorg-600 text-white border-coorg-600"
                      : "bg-white text-ink-700 border-ink-200 hover:border-coorg-300"
                  }`}
                >
                  {c}
                </button>
              );
            })}
            {isFiltered && (
              <button
                onClick={clearAll}
                className="whitespace-nowrap rounded-full px-3 min-h-[40px] text-sm font-semibold text-ink-500 underline"
              >
                {t("feed.clearFilter")}
              </button>
            )}
          </div>
        )}
      </div>

      <main className="flex-1 px-4 py-5">
        {isError ? (
          <LoadError onRetry={onRetry}/>
        ) : isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-[18px] border border-ink-200 shadow-sm p-7 animate-pulse h-40"
              />
            ))}
          </div>
        ) : !isFiltered ? (
          <div className="text-center text-ink-500 py-12">
            <p className="text-sm">
              {t("feed.pickCropHint")}
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="text-center text-ink-500 py-16">
            <p>{t("feed.noListingsMatch")}</p>
          </div>
        ) : (
          <>
            {/* Price sort: a two-option pill toggle above the list. Only shown
                once a crop is selected (this results branch), never on the
                pick-a-crop hint. Sized for a thumb tap on mobile. */}
            <div className="mb-4 flex justify-end">
              <div className="inline-flex rounded-full border-2 border-ink-200 bg-white p-1">
                <SortPill
                  active={sortDir === "mixed"}
                  onClick={() => setSortDir("mixed")}
                >
                  {t("feed.sortPriceMixed")}
                </SortPill>
                <SortPill
                  active={sortDir === "desc"}
                  onClick={() => setSortDir("desc")}
                >
                  {t("feed.sortPriceHighToLow")}
                </SortPill>
                <SortPill
                  active={sortDir === "asc"}
                  onClick={() => setSortDir("asc")}
                >
                  {t("feed.sortPriceLowToHigh")}
                </SortPill>
              </div>
            </div>
            {/* Reveal on mount with animate, not whileInView. This grid is
                shown by tapping a crop chip, so it mounts already in the
                viewport. The in-view observer sometimes never fires in that
                case, leaving the cards stuck at the hidden opacity 0 state,
                which read as a blank white frame until a second tap remounted
                it. animate="show" fades them in unconditionally on mount. */}
            <motion.div
              variants={m.stagger}
              initial="hidden"
              animate="show"
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
            >
              {list.map((item) => <RateCard key={item.id} item={item}/>)}
            </motion.div>
          </>
        )}
      </main>
    </>
  );
}

// One option of the price sort toggle. Matches the crop chip styling: solid
// coorg fill when active, quiet ink text otherwise. aria-pressed exposes the
// active state to screen readers.
function SortPill({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`whitespace-nowrap rounded-full px-4 min-h-[40px] text-sm font-semibold transition-colors ${
        active
          ? "bg-coorg-600 text-white"
          : "text-ink-700 hover:text-coorg-700"
      }`}
    >
      {children}
    </button>
  );
}

// Numeric per-kg price used to order the by-crop view, or null when the
// listing has no sortable price. call_for_price and missing or non-numeric
// price_per_kg return null so the caller can group them out of the ordering.
function numericPrice(item) {
  if (item.call_for_price) return null;
  if (item.price_per_kg == null) return null;
  const n = Number(item.price_per_kg);
  return isNaN(n) ? null : n;
}

// "Updated today" if the timestamp is today, otherwise "Updated <date>".
// Date is rendered with the active language's locale (kn-IN or en-IN).
function freshnessLabel(confirmedAt, t, lang) {
  if (!confirmedAt) return t("feed.notConfirmedYet");
  const ts = Date.parse(confirmedAt);
  if (isNaN(ts)) return "";
  const today = new Date();
  const d = new Date(ts);
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  if (sameDay) return t("feed.updatedToday");
  const locale = lang === "kn" ? "kn-IN" : "en-IN";
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
  return t("feed.updatedOn", { date });
}

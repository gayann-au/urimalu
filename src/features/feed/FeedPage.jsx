import { useMemo, useState, useDeferredValue } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { RateCard } from "./RateCard";
import { useAuth } from "../auth/useAuth";
import { useListings, uniqueCropsInFeed, groupFeedByMerchant } from "./useFeed";

export default function FeedPage() {
  const { t } = useTranslation();
  const listingsQ = useListings();
  const items = listingsQ.data || [];
  const { profile } = useAuth();
  const loggedIn = !!profile;
  const [tab, setTab] = useState("merchants");

  return (
    <div className="flex flex-col flex-1 pb-12 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8">
      <Header/>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-100 sticky top-[64px] z-20">
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
        <MerchantsTab items={items} isLoading={listingsQ.isLoading} loggedIn={loggedIn}/>
      ) : (
        <CropsTab items={items} isLoading={listingsQ.isLoading} loggedIn={loggedIn}/>
      )}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-h-[48px] px-3 text-sm font-bold border-b-2 transition ${
        active
          ? "border-coorg-600 text-coorg-700"
          : "border-transparent text-gray-500"
      }`}
    >
      {children}
    </button>
  );
}

// ----- By Merchant tab -----

function MerchantsTab({ items, isLoading, loggedIn }) {
  const { t } = useTranslation();
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
      <div className="bg-white border-b border-gray-100 px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t("feed.searchMerchant")}
          className="w-full min-h-[48px] rounded-xl border-2 border-gray-200 focus:border-coorg-500 outline-none px-4 text-base"
        />
      </div>

      <main className="flex-1 px-4 py-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse h-32"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <p>
              {deferredSearch.trim()
                ? t("feed.noMerchantsMatch")
                : t("feed.noMerchantsYet")}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
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
          </div>
        )}
      </main>
    </>
  );
}

function MerchantCard({ group, onView }) {
  const { t, i18n } = useTranslation();
  const { merchant, crop_count, last_confirmed_at } = group;
  const freshLabel = freshnessLabel(last_confirmed_at, t, i18n.language);
  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition">
      <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">
        {merchant.business_name}
      </h3>
      <p className="text-sm text-gray-500 mt-0.5 truncate">
        {merchant.town}
        {merchant.town && merchant.district ? ", " : ""}
        {merchant.district}
      </p>
      <p className="text-sm text-gray-700 mt-2 tabular-nums">
        {crop_count === 1
          ? t("feed.buyingOneCrop")
          : t("feed.buyingNCrops", { count: crop_count })}
      </p>
      <p className="text-xs text-gray-400 mt-1">{freshLabel}</p>
      <button
        type="button"
        onClick={onView}
        className="mt-4 w-full min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition"
      >
        {t("feed.viewCropPrices")}
      </button>
    </article>
  );
}

// Logged-out variant: business_name + blurred placeholder teaser + login CTA.
// The placeholder lines are static dummy strings, NOT real merchant data.
// Only business_name is rendered from the group.
function MerchantCardGated({ group, onLogin }) {
  const { t } = useTranslation();
  const name = group.merchant.business_name;
  return (
    <article className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition">
      <h3 className="text-lg font-bold text-gray-900 leading-tight truncate">
        {name}
      </h3>
      {/* Static placeholders, blurred. No real town/district/count/date here. */}
      <p
        aria-hidden="true"
        className="text-sm text-gray-500 mt-0.5 truncate select-none blur-sm"
      >
        xxxxxxxx, xxxxxxx
      </p>
      <p
        aria-hidden="true"
        className="text-sm text-gray-700 mt-2 tabular-nums select-none blur-sm"
      >
        Buying x crops today
      </p>
      <p
        aria-hidden="true"
        className="text-xs text-gray-400 mt-1 select-none blur-sm"
      >
        Updated xx xxx
      </p>
      <button
        type="button"
        onClick={onLogin}
        className="mt-4 w-full min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition"
      >
        {t("feed.loginToSeePrices")}
      </button>
    </article>
  );
}

// ----- By Crop tab -----

function CropsTab({ items, isLoading, loggedIn }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [search, setSearch] = useState("");
  const [cropChip, setCropChip] = useState(null);
  const deferredSearch = useDeferredValue(search);

  const crops = useMemo(() => uniqueCropsInFeed(items), [items]);
  const isFiltered = !!cropChip || deferredSearch.trim().length > 0;

  // Only build the list when a crop is selected or a search is active.
  // When nothing is selected we show the hint instead of dumping every listing.
  const list = useMemo(() => {
    if (!isFiltered) return [];
    const q = deferredSearch.trim().toLowerCase();
    let out = items;
    if (cropChip) out = out.filter((i) => i.crop_name === cropChip);
    if (q) out = out.filter((i) => (i.crop_name || "").toLowerCase().includes(q));
    out = [...out].sort((a, b) => priceKey(b) - priceKey(a));
    return out;
  }, [items, cropChip, deferredSearch, isFiltered]);

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
        <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
          <p className="text-sm text-gray-700">
            {t("feed.loggedOutCropHint")}
          </p>
          <button
            type="button"
            onClick={() => nav("/login")}
            className="mt-4 w-full min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition"
          >
            {t("nav.login")}
          </button>
        </div>
      </main>
    );
  }

  return (
    <>
      <div className="bg-white border-b border-gray-100">
        <div className="px-4 pt-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("feed.searchCrop")}
            className="w-full min-h-[48px] rounded-xl border-2 border-gray-200 focus:border-coorg-500 outline-none px-4 text-base"
          />
        </div>
        {crops.length > 0 && (
          <div className="flex gap-2 px-4 py-3 overflow-x-auto no-scrollbar">
            {crops.map((c) => {
              const active = cropChip === c;
              return (
                <button
                  key={c}
                  onClick={() => toggleChip(c)}
                  className={`whitespace-nowrap rounded-full px-4 min-h-[40px] text-sm font-semibold border-2 transition ${
                    active
                      ? "bg-coorg-600 text-white border-coorg-600"
                      : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {c}
                </button>
              );
            })}
            {isFiltered && (
              <button
                onClick={clearAll}
                className="whitespace-nowrap rounded-full px-3 min-h-[40px] text-sm font-semibold text-gray-500 underline"
              >
                {t("feed.clearFilter")}
              </button>
            )}
          </div>
        )}
      </div>

      <main className="flex-1 px-4 py-4">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse h-40"
              />
            ))}
          </div>
        ) : !isFiltered ? (
          <div className="text-center text-gray-500 py-12">
            <p className="text-sm">
              {t("feed.pickCropHint")}
            </p>
          </div>
        ) : list.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <p>{t("feed.noListingsMatch")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((item) => <RateCard key={item.id} item={item}/>)}
          </div>
        )}
      </main>
    </>
  );
}

// Sort key for the by-crop view: bigger price_per_kg is better.
// call_for_price and missing price_per_kg sink to the bottom.
function priceKey(item) {
  if (item.call_for_price) return -Infinity;
  if (item.price_per_kg == null) return -Infinity;
  const n = Number(item.price_per_kg);
  return isNaN(n) ? -Infinity : n;
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
  const date = d.toLocaleDateString(locale, { day: "numeric", month: "short" });
  return t("feed.updatedOn", { date });
}

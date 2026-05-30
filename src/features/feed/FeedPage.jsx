import { useMemo, useState, useDeferredValue } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { RateCard } from "./RateCard";
import { useUsers, useRates, useReviews } from "./useFeed";
import { useAuth } from "../auth/useAuth";
import { useRealtimeRates } from "../../hooks/useRealtimeRates";
import { useUiStore } from "../../hooks/useUiStore";
import { useQueryClient } from "@tanstack/react-query";
import { qk } from "../../lib/queryClient";
import { getEffectiveStatus, latestRateByMerchant, CROP_CHIPS, DELIVERY_POINTS } from "../../lib/constants";

export default function FeedPage() {
  const { t, i18n } = useTranslation();
  const knCls = i18n.language === "kn" ? "kn" : "";
  const { profile } = useAuth();
  useRealtimeRates();

  const usersQ = useUsers();
  const ratesQ = useRates();
  const reviewsQ = useReviews();
  const qc = useQueryClient();

  const newRatesCount = useUiStore(s => s.newRatesCount);
  const clearNewRates = useUiStore(s => s.clearNewRates);

  const [search, setSearch] = useState("");
  const [cropChip, setCropChip] = useState("all");
  const [spotLiftOnly, setSpotLiftOnly] = useState(false);
  const [spotPayOnly, setSpotPayOnly]   = useState(false);
  const [dpFilter, setDpFilter] = useState("any");
  const [sortBy, setSortBy] = useState("recent");
  const [showFilters, setShowFilters] = useState(false);

  const deferredSearch = useDeferredValue(search);

  const merchantsById = useMemo(() => {
    const m = new Map();
    for (const u of usersQ.data || []) {
      if (u.role === "MERCHANT" && getEffectiveStatus(u) === "APPROVED" && !u.is_disabled) m.set(u.id, u);
    }
    return m;
  }, [usersQ.data]);

  const reviewsByMerchant = useMemo(() => {
    const m = new Map();
    for (const r of reviewsQ.data || []) {
      if (!m.has(r.merchant_id)) m.set(r.merchant_id, []);
      m.get(r.merchant_id).push(r);
    }
    return m;
  }, [reviewsQ.data]);

  const latestPerMerchant = useMemo(() => latestRateByMerchant(ratesQ.data || []), [ratesQ.data]);

  const rows = useMemo(() => {
    const q = deferredSearch.trim().toLowerCase();
    const chip = CROP_CHIPS.find(c => c.id === cropChip) || CROP_CHIPS[0];
    const list = [];
    for (const r of latestPerMerchant) {
      const merchant = merchantsById.get(r.merchant_id);
      if (!merchant) continue;
      if (!chip.match(r)) continue;
      if (q) {
        const hay = `${merchant.business_name || ""} ${merchant.town || ""}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      if (spotLiftOnly && !r.rc_spot_lifting) continue;
      if (spotPayOnly && !r.spot_payment) continue;
      if (dpFilter !== "any" && !(r.delivery_points || []).includes(dpFilter)) continue;
      list.push({ merchant, rate: r, reviews: reviewsByMerchant.get(merchant.id) || [] });
    }
    list.sort((a, b) => {
      if (sortBy === "rc")     return (Number(b.rate.rc_ep_price) || 0)   - (Number(a.rate.rc_ep_price) || 0);
      if (sortBy === "ac")     return (Number(b.rate.ac_price) || 0)      - (Number(a.rate.ac_price) || 0);
      if (sortBy === "pepper") return (Number(b.rate.pepper_price) || 0)  - (Number(a.rate.pepper_price) || 0);
      return Date.parse(b.rate.posted_at) - Date.parse(a.rate.posted_at);
    });
    return list;
  }, [latestPerMerchant, merchantsById, reviewsByMerchant, deferredSearch, cropChip, spotLiftOnly, spotPayOnly, dpFilter, sortBy]);

  const activeCount = (spotLiftOnly ? 1 : 0) + (spotPayOnly ? 1 : 0) + (dpFilter !== "any" ? 1 : 0);
  const isFiltered = !!search.trim() || activeCount > 0 || cropChip !== "all";

  function onClear() {
    setSearch(""); setSpotLiftOnly(false); setSpotPayOnly(false); setDpFilter("any"); setCropChip("all");
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: qk.rates });
    qc.invalidateQueries({ queryKey: qk.users });
    qc.invalidateQueries({ queryKey: qk.reviews });
    clearNewRates();
  }

  const canSeeFull = !!profile;
  const loading = usersQ.isLoading || ratesQ.isLoading;

  function cropLabel(id) {
    return id === "all" ? t("admin.filter.all", "All") : t(`section.${id}`);
  }

  return (
    <div className="flex flex-col flex-1 pb-12">
      <Header/>

      {!profile && (
        <div className="bg-coorg-50 border-b border-coorg-100 px-4 py-2.5 flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold text-coorg-900 ${knCls}`}>{t("feed.loginToSeeRates")}</span>
          <Link to="/login" className={`text-sm font-bold text-coorg-700 underline shrink-0 ${knCls}`}>{t("nav.login")}</Link>
        </div>
      )}

      {/* Filter + search bar */}
      <div className="bg-white border-b border-gray-100 sticky top-[64px] z-20">
        <div className="flex gap-2 px-4 pt-3 overflow-x-auto no-scrollbar">
          {CROP_CHIPS.map(c => {
            const active = cropChip === c.id;
            return (
              <button key={c.id} onClick={() => setCropChip(c.id)}
                className={`whitespace-nowrap rounded-full px-4 min-h-[48px] text-sm font-semibold border-2 transition ${knCls} ${
                  active ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200 hover:border-gray-300"
                }`}>
                {cropLabel(c.id)}
              </button>
            );
          })}
        </div>

        <div className="px-4 pt-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("feed.search")}
            className="w-full min-h-[48px] rounded-xl border-2 border-gray-200 focus:border-coorg-500 outline-none px-4 text-base"
          />
        </div>

        <div className="flex items-center gap-2 px-4 py-3">
          <button onClick={() => setShowFilters(s => !s)}
            className={`inline-flex items-center gap-2 rounded-xl border-2 px-4 min-h-[48px] text-sm font-semibold transition ${
              activeCount > 0 ? "border-coorg-500 text-coorg-700 bg-coorg-50" : "border-gray-200 text-gray-700 bg-white hover:border-gray-300"
            }`}>
            <span className={knCls}>{t("feed.moreFilters", "Filters")}</span>
            {activeCount > 0 && <span className="rounded-full bg-coorg-600 text-white text-xs px-2 py-0.5 tabular-nums">{activeCount}</span>}
          </button>

          <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
            className={`ml-auto rounded-xl border-2 border-gray-200 bg-white px-3 min-h-[48px] text-sm font-semibold text-gray-700 ${knCls}`}>
            <option value="recent">{t("feed.sortRecent")}</option>
            <option value="rc">{t("feed.sortHighestRC")}</option>
            <option value="ac">{t("feed.sortHighestAC")}</option>
            <option value="pepper">{t("feed.sortHighestPepper")}</option>
          </select>
        </div>

        {showFilters && (
          <div className="px-4 pb-4 border-t border-gray-100 pt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              <button onClick={() => setSpotLiftOnly(v => !v)}
                className={`rounded-full px-4 min-h-[48px] text-sm font-semibold border-2 transition ${knCls} ${
                  spotLiftOnly ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
                }`}>
                {t("feed.spotLiftOnly")}
              </button>
              <button onClick={() => setSpotPayOnly(v => !v)}
                className={`rounded-full px-4 min-h-[48px] text-sm font-semibold border-2 transition ${knCls} ${
                  spotPayOnly ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
                }`}>
                {t("feed.spotPayOnly")}
              </button>
            </div>
            <div>
              <label className={`block text-sm font-semibold text-gray-700 mb-1.5 ${knCls}`}>{t("feed.deliveryPoint")}</label>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => setDpFilter("any")}
                  className={`rounded-full px-4 min-h-[48px] text-sm font-semibold border-2 ${
                    dpFilter === "any" ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
                  }`}>
                  {t("feed.any")}
                </button>
                {DELIVERY_POINTS.map(dp => (
                  <button key={dp} onClick={() => setDpFilter(dp)}
                    className={`rounded-full px-4 min-h-[48px] text-sm font-semibold border-2 ${
                      dpFilter === dp ? "bg-coorg-600 text-white border-coorg-600" : "bg-white text-gray-700 border-gray-200"
                    }`}>
                    {dp}
                  </button>
                ))}
              </div>
            </div>
            {isFiltered && (
              <button onClick={onClear}
                className={`w-full min-h-[48px] rounded-xl border-2 border-gray-200 text-gray-700 font-semibold hover:border-gray-300 ${knCls}`}>
                {t("common.clearFilters")}
              </button>
            )}
          </div>
        )}
      </div>

      <main className="flex-1 px-4 py-4 space-y-4">
        {loading ? (
          [0,1,2].map(i => <div key={i} className="bg-white rounded-2xl border border-gray-200 p-5 animate-pulse h-56"/>)
        ) : rows.length === 0 ? (
          <div className="text-center text-gray-500 py-16">
            <p className={knCls}>{isFiltered ? t("feed.noSearchResults") : t("feed.noResults")}</p>
          </div>
        ) : (
          rows.map(({ merchant, rate, reviews }) => (
            <RateCard key={rate.id} merchant={merchant} rate={rate} reviews={reviews} canSeeFull={canSeeFull}/>
          ))
        )}

        {!profile && (
          <div className="pt-6 pb-2 text-center">
            <Link to="/signup/merchant" className={`text-sm text-gray-500 hover:text-coorg-700 underline ${knCls}`}>
              {t("feed.areYouMerchant")}
            </Link>
          </div>
        )}
      </main>

      {newRatesCount > 0 && (
        <button onClick={refresh}
          className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-40 bg-coorg-700 text-white px-5 min-h-[48px] rounded-full shadow-lg text-sm font-bold ${knCls}`}>
          {t("feed.newRates", { n: newRatesCount })}
        </button>
      )}
    </div>
  );
}

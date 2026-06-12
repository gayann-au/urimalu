import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Header } from "../../components/layout/Header";
import { Badge } from "../../components/ui/Badge";
import { Stars } from "../../components/icons/Stars";
import { Toggle } from "../../components/ui/Toggle";
import { useAuth } from "../auth/useAuth";
import { useUsers, useReviews } from "../feed/useFeed";
import { useLeadTracking } from "../../hooks/useLeadTracking";
import { useAddReview } from "../reviews/useReviews";
import { ReviewForm } from "../reviews/ReviewForm";
import { supabase } from "../../lib/supabase";
import { formatINR, dayKey, lastNDays } from "../../lib/constants";

// All listings for this merchant, active AND inactive. Public read.
// Uses a distinct cache key from the dashboard's useMyListings — the public
// profile view and the merchant's own private dashboard read the same table
// but in different contexts and must not overwrite each other's cache.
function useAllListingsForMerchant(merchantId) {
  return useQuery({
    queryKey: ["listings", "public-profile", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("merchant_id", merchantId)
        .order("crop_name", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

// Inline query: this merchant's price history rows for the last 7 days.
function usePriceHistoryForMerchant(merchantId) {
  return useQuery({
    queryKey: ["price_history", "merchant", merchantId],
    enabled: !!merchantId,
    queryFn: async () => {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const { data, error } = await supabase
        .from("price_history")
        .select("*")
        .eq("merchant_id", merchantId)
        .gte("recorded_at", sevenDaysAgo.toISOString())
        .order("recorded_at", { ascending: true });
      if (error) throw error;
      return data || [];
    },
  });
}

export default function ProfilePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { profile: me } = useAuth();
  const usersQ      = useUsers();
  const listingsQ   = useAllListingsForMerchant(id);
  const reviewsQ    = useReviews();
  const historyQ    = usePriceHistoryForMerchant(id);
  const addReview   = useAddReview();
  const { trackView, trackLead } = useLeadTracking();
  const [showReview, setShowReview] = useState(false);

  // Filter bar state
  const [search, setSearch]         = useState("");
  const [sortBy, setSortBy]         = useState("name");   // "name" | "price"
  const [activeOnly, setActiveOnly] = useState(true);

  const merchant = (usersQ.data || []).find(
    (u) => u.id === id && u.role === "MERCHANT"
  );
  const reviews = useMemo(
    () => (reviewsQ.data || []).filter((r) => r.merchant_id === id),
    [reviewsQ.data, id]
  );

  // Filtered + sorted listing list.
  const filtered = useMemo(() => {
    let list = listingsQ.data || [];
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((l) => (l.crop_name || "").toLowerCase().includes(q));
    if (activeOnly) list = list.filter((l) => l.is_active);
    list = [...list];
    if (sortBy === "price") {
      list.sort((a, b) => priceKey(b) - priceKey(a));
    } else {
      list.sort((a, b) => (a.crop_name || "").localeCompare(b.crop_name || ""));
    }
    return list;
  }, [listingsQ.data, search, sortBy, activeOnly]);

  // One chart per crop with at least 2 data points in the last 7 days.
  // For each day, take the latest snapshot for that crop.
  const histories = useMemo(() => {
    if (!historyQ.data) return [];
    const byCrop = new Map();
    for (const row of historyQ.data) {
      if (row.price_per_kg == null) continue;
      if (!byCrop.has(row.crop_name)) byCrop.set(row.crop_name, []);
      byCrop.get(row.crop_name).push(row);
    }
    const days = lastNDays(7);
    const result = [];
    for (const [crop, rows] of byCrop) {
      const byDay = new Map();
      for (const r of rows) {
        const d = dayKey(r.recorded_at);
        const ex = byDay.get(d);
        if (!ex || Date.parse(r.recorded_at) > Date.parse(ex.recorded_at)) {
          byDay.set(d, r);
        }
      }
      const data = days.map((d) => {
        const r = byDay.get(d);
        const p = r?.price_per_kg != null ? Number(r.price_per_kg) : null;
        return { day: d.slice(5), price: isNaN(p) ? null : p };
      });
      const points = data.filter((x) => x.price != null).length;
      if (points >= 2) result.push({ crop, data });
    }
    result.sort((a, b) => a.crop.localeCompare(b.crop));
    return result;
  }, [historyQ.data]);

  useEffect(() => {
    if (merchant) trackView(merchant.id);
  }, [merchant?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (usersQ.isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title")}/>
        <div className="p-6 text-center text-gray-500">{t("common.loading")}</div>
      </div>
    );
  }
  if (!merchant) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title")}/>
        <div className="p-6 text-center text-gray-500">{t("profile.notFound")}</div>
      </div>
    );
  }
  if (merchant.status !== "APPROVED" || merchant.is_disabled) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title")}/>
        <div className="p-6 text-center text-gray-500">{t("profile.notVisible")}</div>
      </div>
    );
  }

  const canReview = !!me && me.role !== "MERCHANT";
  const avg = reviews.length
    ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  const callPhone = merchant.phone;
  const waPhone   = merchant.whatsapp || merchant.phone;
  const locale    = i18n.language === "kn" ? "kn-IN" : "en-IN";

  function onCall() {
    if (!callPhone) return;
    trackLead(merchant.id, "CALL");
    window.location.href = `tel:${callPhone}`;
  }
  function onWa() {
    if (!waPhone) return;
    trackLead(merchant.id, "WHATSAPP");
    const num = String(waPhone).replace(/[^0-9]/g, "");
    const msg = encodeURIComponent(
      t("profile.waMessage", { name: merchant.business_name })
    );
    window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
  }

  return (
    <div className="flex flex-col flex-1 pb-10 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8">
      <Header showBack title={t("profile.title")}/>

      {/* Identity */}
      <section className="px-4 py-5 border-b border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 leading-tight">{merchant.business_name}</h2>
        {merchant.owner_name && (
          <p className="text-sm text-gray-500 mt-1">{merchant.owner_name}</p>
        )}
        <p className="text-sm text-gray-500">
          {merchant.town}
          {merchant.town && merchant.district ? ", " : ""}
          {merchant.district}
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <Badge tone="approved">{t("profile.verifiedMerchant")}</Badge>
          {merchant.years_trading && (
            <Badge tone="neutral">
              {t("profile.tradingBadge", { years: merchant.years_trading })}
            </Badge>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {reviews.length > 0 ? (
            <>
              <Stars value={avg} size={16}/>
              <span className="text-sm text-gray-700">
                {t("profile.ratingSummary", { avg: avg.toFixed(1), count: reviews.length })}
              </span>
            </>
          ) : (
            <span className="text-sm text-gray-400">{t("review.noneYet")}</span>
          )}
        </div>
      </section>

      {/* Crops: filter bar + list */}
      <section className="px-4 pt-6">
        <SectionHeader>{t("profile.cropsHeading")}</SectionHeader>

        {/* Filter bar */}
        <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-3 space-y-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("feed.searchCrop")}
            className="w-full min-h-[44px] rounded-xl border-2 border-gray-200 focus:border-coorg-500 outline-none px-3 text-sm"
          />
          <div className="grid grid-cols-2 gap-2 items-center">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="min-h-[44px] rounded-xl border-2 border-gray-200 focus:border-coorg-500 outline-none px-3 text-sm bg-white"
            >
              <option value="name">{t("profile.sortByName")}</option>
              <option value="price">{t("profile.sortByPrice")}</option>
            </select>
            <Toggle
              label={t("profile.buyingTodayOnly")}
              value={activeOnly}
              onChange={setActiveOnly}
            />
          </div>
        </div>

        {/* Listings */}
        {listingsQ.isLoading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse h-24"/>
        ) : filtered.length === 0 ? (
          <Empty>{t("profile.noCropsMatch")}</Empty>
        ) : (
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((l) => (
              <ListingRow key={l.id} listing={l} t={t}/>
            ))}
          </ul>
        )}
      </section>

      {/* Contact */}
      <section className="px-4 pt-8">
        <SectionHeader>{t("card.contact")}</SectionHeader>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-gray-700">{merchant.owner_name || "-"}</span>
            <span className="font-semibold text-gray-900 tabular-nums">{merchant.phone || "-"}</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={onCall}
              className="min-h-[48px] rounded-xl border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm hover:bg-coorg-50 transition"
            >
              {t("common.call")}
            </button>
            <button
              type="button"
              onClick={onWa}
              className="min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition"
            >
              {t("common.whatsapp")}
            </button>
          </div>
        </div>
      </section>

      {/* Price history: one chart per crop with at least 2 data points */}
      <section className="px-4 pt-8">
        <SectionHeader>{t("profile.historyHeading")}</SectionHeader>
        {historyQ.isLoading ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 animate-pulse h-48"/>
        ) : histories.length === 0 ? (
          <Empty>{t("profile.notEnoughData")}</Empty>
        ) : (
          <div className="space-y-3">
            {histories.map((h) => (
              <div key={h.crop} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="text-sm font-semibold text-gray-900 mb-3">{h.crop}</div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={h.data} margin={{ top: 5, right: 8, bottom: 0, left: -12 }}>
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={40}/>
                      <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}/>
                      <Bar
                        dataKey="price"
                        fill="#1f7d44"
                        radius={[6, 6, 0, 0]}
                        name={t("profile.chartSeriesPerKg", { crop: h.crop })}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reviews */}
      <section className="px-4 pt-8">
        <SectionHeader>{t("profile.reviewsHeading", { count: reviews.length })}</SectionHeader>

        {canReview && (
          <>
            <button
              type="button"
              onClick={() => setShowReview((s) => !s)}
              className="w-full min-h-[48px] rounded-xl border-2 border-coorg-600 text-coorg-700 font-bold text-sm hover:bg-coorg-50 transition"
            >
              {t("profile.leaveReview")}
            </button>
            {showReview && (
              <div className="mt-3">
                <ReviewForm
                  onCancel={() => setShowReview(false)}
                  onSubmit={async (p) => {
                    await addReview.mutateAsync({
                      merchantId: merchant.id,
                      authorName: me.full_name || t("profile.defaultFarmerName"),
                      ...p,
                    });
                    setShowReview(false);
                  }}
                />
              </div>
            )}
          </>
        )}

        {reviews.length === 0 ? (
          <Empty>{t("profile.noReviewsCta")}</Empty>
        ) : (
          <ul className="mt-3 space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-900">
                    {t("profile.starsLabel", { n: r.rating })}
                  </span>
                  <span className="text-xs text-gray-400">
                    {new Date(r.created_at).toLocaleDateString(locale, {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                <div className="text-xs text-gray-500 mt-0.5">{r.author_name}</div>
                {r.comment && <p className="mt-2 text-sm text-gray-700">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ListingRow({ listing, t }) {
  const active = !!listing.is_active;
  const dim = active ? "" : "opacity-60";
  return (
    <li className={`bg-white rounded-2xl border border-gray-200 p-4 ${dim}`}>
      <div className="font-bold text-gray-900">{listing.crop_name}</div>
      {listing.variety_notes && (
        <div className="text-xs text-gray-500 mt-0.5">{listing.variety_notes}</div>
      )}
      {listing.call_for_price ? (
        <div className="mt-1 text-sm font-bold text-gray-700">{t("card.callForPrice")}</div>
      ) : (
        <>
          <div className="mt-1 text-sm text-gray-700 tabular-nums">
            {t("card.pricePerUnit", {
              price: formatINR(listing.price),
              unit: listing.unit_label,
            })}
          </div>
          {listing.price_per_kg != null && (
            <div className="text-lg font-extrabold text-coorg-700 tabular-nums">
              {t("card.pricePerKg", { price: formatINR(listing.price_per_kg) })}
            </div>
          )}
        </>
      )}
      {listing.notes && (
        <div className="text-xs text-gray-500 italic mt-1">{listing.notes}</div>
      )}
      {!active && (
        <div className="text-xs text-gray-500 italic mt-2">{t("card.notBuyingToday")}</div>
      )}
    </li>
  );
}

// Sort key for price-DESC: bigger price_per_kg is better.
// call_for_price and missing price_per_kg sink to the bottom.
function priceKey(item) {
  if (item.call_for_price) return -Infinity;
  if (item.price_per_kg == null) return -Infinity;
  const n = Number(item.price_per_kg);
  return isNaN(n) ? -Infinity : n;
}

function SectionHeader({ children }) {
  return <h3 className="text-base font-bold text-gray-900 mb-3">{children}</h3>;
}

function Empty({ children }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500">
      {children}
    </div>
  );
}

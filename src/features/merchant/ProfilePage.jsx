import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "framer-motion";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Header } from "../../components/layout/Header";
import { Stars } from "../../components/icons/Stars";
import { Toggle } from "../../components/ui/Toggle";
import { useAuth } from "../auth/useAuth";
import { useUsers, useReviews } from "../feed/useFeed";
import { useLeadTracking } from "../../hooks/useLeadTracking";
import { useAddReview } from "../reviews/useReviews";
import { ReviewForm } from "../reviews/ReviewForm";
import { supabase } from "../../lib/supabase";
import { FreshnessBadge } from "../../components/ui/FreshnessBadge";
import { formatINR, dayKey, lastNDays, listingPriceView, BAG_WEIGHTS, formatValidTill } from "../../lib/constants";

// Shared easing, matches the landing page --ease-out token.
const EASE = [0.22, 0.61, 0.36, 1];

// All listings for this merchant, active AND inactive. Public read.
// Uses a distinct cache key from the dashboard's useMyListings. The public
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
  const reduce = useReducedMotion();
  const usersQ      = useUsers();
  const listingsQ   = useAllListingsForMerchant(id);
  const reviewsQ    = useReviews();
  const historyQ    = usePriceHistoryForMerchant(id);
  const addReview   = useAddReview();
  const { trackView, trackLead } = useLeadTracking();
  const [showReview, setShowReview] = useState(false);
  const [numberRevealed, setNumberRevealed] = useState(false);
  // Separate from numberRevealed: remembers that the SHOW_NUMBER lead already
  // fired this page visit, so toggling hide/show again never re-fires analytics.
  const [numberLeadFired, setNumberLeadFired] = useState(false);

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

  // Motion variants. Reduced motion drops the travel and keeps a gentle fade.
  const fadeUp = {
    hidden: { opacity: 0, y: reduce ? 0 : 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
  };
  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.07, delayChildren: 0.04 } },
  };
  const cardHover = reduce
    ? undefined
    : { y: -4, transition: { type: "spring", stiffness: 320, damping: 24 } };
  const btnHover = reduce ? undefined : { y: -1 };
  const btnTap = reduce ? undefined : { scale: 0.97 };
  const inView = { once: true, amount: 0.15 };

  if (usersQ.isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title")}/>
        <div className="p-6 text-center text-ink-500">{t("common.loading")}</div>
      </div>
    );
  }
  if (!merchant) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title")}/>
        <div className="p-6 text-center text-ink-500">{t("profile.notFound")}</div>
      </div>
    );
  }
  if (merchant.status !== "APPROVED" || merchant.is_disabled) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title")}/>
        <div className="p-6 text-center text-ink-500">{t("profile.notVisible")}</div>
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
  function onShowNumber() {
    setNumberRevealed(true);
    if (numberLeadFired) return;
    setNumberLeadFired(true);
    trackLead(merchant.id, "SHOW_NUMBER");
  }
  function onHideNumber() {
    setNumberRevealed(false);
  }

  return (
    <div className="flex flex-col flex-1 pb-14 w-full mx-auto max-w-5xl px-4 md:px-6">
      <Header showBack title={t("profile.title")}/>

      {/* Identity */}
      <motion.section
        className="pt-6"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <div className="bg-white rounded-3xl border border-ink-100 shadow-sm p-6 md:p-8">
          <motion.h2
            variants={fadeUp}
            className="font-display text-3xl md:text-4xl font-extrabold text-chilli-700 leading-[1.05] tracking-tight break-words"
          >
            {merchant.business_name}
          </motion.h2>

          <motion.div variants={fadeUp} className="mt-2 space-y-0.5">
            {merchant.owner_name && (
              <p className="text-sm text-ink-600">{merchant.owner_name}</p>
            )}
            <p className="text-sm text-ink-500">
              {merchant.town}
              {merchant.town && merchant.district ? ", " : ""}
              {merchant.district}
            </p>
          </motion.div>

          <motion.div variants={fadeUp} className="mt-4 flex items-center gap-2 flex-wrap">
            <Pill tone="crop">
              <CheckIcon/>
              {t("profile.verifiedMerchant")}
            </Pill>
            {merchant.years_trading && i18n.exists(`years.${merchant.years_trading}`) && (
              <Pill tone="neutral">
                {t("profile.tradingBadge", { years: t(`years.${merchant.years_trading}`) })}
              </Pill>
            )}
          </motion.div>

          <motion.div variants={fadeUp} className="mt-3 flex items-center gap-2">
            {reviews.length > 0 ? (
              <>
                <Stars value={avg} size={16}/>
                <span className="text-sm text-ink-700">
                  {t("profile.ratingSummary", { avg: avg.toFixed(1), count: reviews.length })}
                </span>
              </>
            ) : (
              <span className="text-sm text-ink-400">{t("review.noneYet")}</span>
            )}
          </motion.div>

          {/* Merchant-typed about text. Free text, rendered as-is (no translation
              of content); only the label goes through i18n. Hidden when empty.
              Contained to a readable measure with word breaking so long or
              unbroken input wraps cleanly instead of overflowing. */}
          {merchant.business_description && merchant.business_description.trim() && (
            <motion.div variants={fadeUp} className="mt-5 rounded-2xl bg-paper-2 p-4 md:p-5">
              <div className="text-xs font-bold uppercase tracking-wide text-ink-500">{t("profile.about")}</div>
              <p className="mt-1.5 max-w-prose text-[15px] leading-relaxed text-ink-700 whitespace-pre-line break-words">
                {merchant.business_description}
              </p>
            </motion.div>
          )}
        </div>
      </motion.section>

      {/* Crops: filter bar + list */}
      <motion.section
        className="pt-10"
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={inView}
      >
        <SectionHeader>{t("profile.cropsHeading")}</SectionHeader>

        {/* Filter bar */}
        <div className="bg-white rounded-3xl border border-ink-100 shadow-sm p-4 mb-4 space-y-3">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("feed.searchCrop")}
            className="w-full min-h-[46px] rounded-2xl border-2 border-ink-200 focus:border-coorg-500 outline-none px-4 text-sm bg-white"
          />
          <div className="grid grid-cols-2 gap-2 items-center">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="min-h-[46px] rounded-2xl border-2 border-ink-200 focus:border-coorg-500 outline-none px-3 text-sm bg-white"
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
          <div className="bg-white rounded-3xl border border-ink-100 shadow-sm p-6 animate-pulse h-28"/>
        ) : filtered.length === 0 ? (
          <Empty>{t("profile.noCropsMatch")}</Empty>
        ) : (
          <motion.ul
            className="grid grid-cols-1 md:grid-cols-2 gap-4"
            variants={stagger}
            initial="hidden"
            whileInView="show"
            viewport={inView}
          >
            {filtered.map((l) => (
              <ListingRow key={l.id} listing={l} t={t} fadeUp={fadeUp} cardHover={cardHover}/>
            ))}
          </motion.ul>
        )}
      </motion.section>

      {/* Contact */}
      <motion.section
        className="pt-10"
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={inView}
      >
        <SectionHeader>{t("card.contact")}</SectionHeader>
        <div className="bg-white rounded-3xl border border-ink-100 shadow-sm p-6">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-ink-700 font-medium">{merchant.owner_name || "-"}</span>
            {numberRevealed ? (
              <div className="flex items-center gap-3">
                <span className="font-bold text-ink-900 tabular-nums">{merchant.phone || "-"}</span>
                <button
                  type="button"
                  onClick={onHideNumber}
                  className="text-xs font-semibold text-ink-500 underline"
                >
                  {t("common.hideNumber")}
                </button>
              </div>
            ) : (
              <motion.button
                type="button"
                onClick={onShowNumber}
                whileHover={btnHover}
                whileTap={btnTap}
                className="min-h-[40px] rounded-full border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm px-4 hover:bg-coorg-50 transition-colors"
              >
                {t("common.showNumber")}
              </motion.button>
            )}
          </div>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <motion.button
              type="button"
              onClick={onCall}
              whileHover={btnHover}
              whileTap={btnTap}
              className="min-h-[52px] rounded-full border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm hover:bg-coorg-50 transition-colors"
            >
              {t("common.call")}
            </motion.button>
            <motion.button
              type="button"
              onClick={onWa}
              whileHover={btnHover}
              whileTap={btnTap}
              className="min-h-[52px] rounded-full bg-coorg-600 text-white font-bold text-sm shadow-sm hover:bg-coorg-700 transition-colors"
            >
              {t("common.whatsapp")}
            </motion.button>
          </div>
        </div>
      </motion.section>

      {/* Price history: one chart per crop with at least 2 data points */}
      <motion.section
        className="pt-10"
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={inView}
      >
        <SectionHeader>{t("profile.historyHeading")}</SectionHeader>
        {historyQ.isLoading ? (
          <div className="bg-white rounded-3xl border border-ink-100 shadow-sm p-6 animate-pulse h-48"/>
        ) : histories.length === 0 ? (
          <Empty>{t("profile.notEnoughData")}</Empty>
        ) : (
          <div className="space-y-4">
            {histories.map((h) => (
              <div key={h.crop} className="bg-white rounded-3xl border border-ink-100 shadow-sm p-5 md:p-6">
                <div className="text-sm font-bold text-ink-900 mb-3">{h.crop}</div>
                <div className="h-48 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={h.data} margin={{ top: 5, right: 8, bottom: 0, left: -12 }}>
                      <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#8A7D78" }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fontSize: 10, fill: "#8A7D78" }} axisLine={false} tickLine={false} width={40}/>
                      <Tooltip contentStyle={{ borderRadius: 14, border: "1px solid #E6DED8", fontSize: 12 }}/>
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
      </motion.section>

      {/* Reviews */}
      <motion.section
        className="pt-10"
        variants={fadeUp}
        initial="hidden"
        whileInView="show"
        viewport={inView}
      >
        <SectionHeader>{t("profile.reviewsHeading", { count: reviews.length })}</SectionHeader>

        {canReview && (
          <>
            <motion.button
              type="button"
              onClick={() => setShowReview((s) => !s)}
              whileHover={btnHover}
              whileTap={btnTap}
              className="w-full min-h-[52px] rounded-full border-2 border-coorg-600 text-coorg-700 font-bold text-sm hover:bg-coorg-50 transition-colors"
            >
              {t("profile.leaveReview")}
            </motion.button>
            {showReview && (
              <div className="mt-4">
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
          <div className={canReview ? "mt-4" : ""}>
            <Empty>{t("profile.noReviewsCta")}</Empty>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {reviews.map((r) => (
              <li key={r.id} className="bg-white rounded-3xl border border-ink-100 shadow-sm p-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold text-ink-900">
                    {t("profile.starsLabel", { n: r.rating })}
                  </span>
                  <span className="text-xs text-ink-400">
                    {new Date(r.created_at).toLocaleDateString(locale, {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </span>
                </div>
                <div className="text-xs text-ink-500 mt-0.5">{r.author_name}</div>
                {r.comment && <p className="mt-2 text-sm text-ink-700">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </motion.section>
    </div>
  );
}

function ListingRow({ listing, t, fadeUp, cardHover }) {
  const active = !!listing.is_active;
  const dim = active ? "" : "opacity-60";
  const price = listingPriceView(listing);
  const validTill = formatValidTill(listing.valid_till);
  return (
    <motion.li
      variants={fadeUp}
      whileHover={cardHover}
      className={`bg-white rounded-3xl border border-ink-100 shadow-sm p-5 md:p-6 ${dim}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-11 h-11 rounded-2xl bg-coorg-50 text-coorg-600 grid place-items-center shrink-0">
            <BeanIcon/>
          </span>
          <div className="min-w-0">
            <div className="font-display font-extrabold text-lg text-ink-900 leading-tight truncate">{listing.crop_name}</div>
            {listing.variety_notes && (
              <div className="text-xs text-ink-500 mt-0.5 truncate">{listing.variety_notes}</div>
            )}
          </div>
        </div>
        <FreshnessBadge confirmedAt={listing.confirmed_at} className="bg-paper-2 rounded-full px-2.5 py-1 shrink-0" />
      </div>
      <ListingPrice price={price} t={t} />
      {price.mode === "perkg" && price.perKg != null && (
        <BagTotals perKg={price.perKg} t={t} />
      )}
      {validTill && (
        <div className="text-xs text-ink-500 mt-2">
          {t("card.priceValidTill", { date: validTill })}
        </div>
      )}
      {listing.notes && (
        <div className="text-xs text-ink-500 italic mt-1">{listing.notes}</div>
      )}
      {!active && (
        <div className="text-xs text-ink-500 italic mt-2">{t("card.notBuyingToday")}</div>
      )}
    </motion.li>
  );
}

// Mirrors the by-crop card price logic so both screens read identically:
// per-kg listings show one hero line, bag/quintal show the entered price with
// a quiet per-kg line below, and "per" is never doubled.
function ListingPrice({ price, t }) {
  if (price.mode === "call") {
    return <div className="mt-3 text-base font-bold text-ink-700">{t("card.callForPrice")}</div>;
  }
  if (price.mode === "perkg") {
    if (price.hero == null) return <div className="mt-3 text-base font-bold text-ink-400">-</div>;
    return (
      <div className="mt-3 flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold text-coorg-700 tabular-nums">{formatINR(price.hero)}</span>
        <span className="text-xs font-semibold text-ink-500">{t("card.perKgSuffix")}</span>
      </div>
    );
  }
  if (price.hero == null) return <div className="mt-3 text-base font-bold text-ink-400">-</div>;
  return (
    <div className="mt-3">
      <div className="flex items-baseline gap-1.5">
        <span className="text-2xl font-extrabold text-coorg-700 tabular-nums">{formatINR(price.hero)}</span>
        <span className="text-xs font-semibold text-ink-500">{listingUnitPhrase(t, price.unitLabel)}</span>
      </div>
      {price.perKg != null && (
        <div className="text-xs text-ink-500 tabular-nums mt-0.5">
          {t("card.thatIsPerKg", { price: formatINR(price.perKg) })}
        </div>
      )}
    </div>
  );
}

// "See total for a bag": tappable weight chips that multiply price_per_kg,
// mirroring the by-crop card so both screens read identically. Local state
// only, defaults to 50 kg, no backend.
function BagTotals({ perKg, t }) {
  const [weight, setWeight] = useState(50);
  const total = Math.round(weight * Number(perKg));
  return (
    <div className="mt-4 rounded-2xl bg-paper-2 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-ink-500">{t("card.seeTotalForBag")}</div>
      <div className="mt-2.5 flex flex-wrap gap-2">
        {BAG_WEIGHTS.map((w) => {
          const active = w === weight;
          return (
            <button
              key={w}
              type="button"
              onClick={() => setWeight(w)}
              className={`min-h-[36px] rounded-full px-3.5 text-xs font-bold border-2 transition-colors ${
                active
                  ? "bg-coorg-600 text-white border-coorg-600"
                  : "bg-white text-ink-700 border-ink-200 hover:border-coorg-300"
              }`}
            >
              {t("card.weightChip", { weight: w })}
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-sm font-bold text-ink-800 tabular-nums">
        {t("card.weightTotal", { weight, total: formatINR(total) })}
      </div>
    </div>
  );
}

// Same "per <unit>" guard as the by-crop card: never doubles the word "per".
function listingUnitPhrase(t, unitLabel) {
  const label = (unitLabel || "").trim();
  if (/^per\b/i.test(label)) return label;
  return t("card.perUnit", { unit: label });
}

// Sort key for price-DESC: bigger price_per_kg is better.
// call_for_price and missing price_per_kg sink to the bottom.
function priceKey(item) {
  if (item.call_for_price) return -Infinity;
  if (item.price_per_kg == null) return -Infinity;
  const n = Number(item.price_per_kg);
  return isNaN(n) ? -Infinity : n;
}

// Soft pill in the landing style: tinted background, same-hue bold text, gentle
// border. Tones map to the shared palette (crop green, chilli red, warm neutral).
function Pill({ tone = "neutral", className = "", children }) {
  const tones = {
    crop:    "bg-coorg-50 text-coorg-700 border border-coorg-100",
    chilli:  "bg-chilli-50 text-chilli-700 border border-chilli-100",
    neutral: "bg-paper-2 text-ink-700 border border-ink-100",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${tones[tone] || tones.neutral} ${className}`}>
      {children}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Coffee-bean glyph from the landing hero, used as the soft crop icon.
function BeanIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="6.5" ry="9" />
      <path d="M12 3.5c-2.4 3-2.4 14 0 17" />
    </svg>
  );
}

function SectionHeader({ children }) {
  return <h3 className="font-display text-xl md:text-2xl font-extrabold tracking-tight text-ink-900 mb-4">{children}</h3>;
}

function Empty({ children }) {
  return (
    <div className="bg-white rounded-3xl border border-ink-100 shadow-sm p-8 text-center text-ink-500">
      {children}
    </div>
  );
}

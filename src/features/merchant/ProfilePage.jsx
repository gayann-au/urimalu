import { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Header } from "../../components/layout/Header";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Stars } from "../../components/icons/Stars";
import { useAuth } from "../auth/useAuth";
import { useUsers, useRates, useReviews } from "../feed/useFeed";
import { useLeadTracking } from "../../hooks/useLeadTracking";
import { useAddReview } from "../reviews/useReviews";
import { ReviewForm } from "../reviews/ReviewForm";
import { latestRateByMerchant, formatINR, formatTime12, getEffectiveStatus, dayKey, lastNDays } from "../../lib/constants";

// Crops eligible for the price-history chart, in display priority order.
const HISTORY_CROPS = [
  { key: "rc_ep_price",   nameKey: "section.rc", code: "RC" },
  { key: "ac_price",      nameKey: "section.ac", code: "AC" },
  { key: "ap_price",      nameKey: "section.ap", code: "AP" },
  { key: "rp_price",      nameKey: "section.rp", code: "RP" },
  { key: "ot_price",      nameKey: "section.ot", code: "OT" },
  { key: "pepper_price",  nameKey: "section.pepper", code: "" },
  { key: "cardamom_price",nameKey: "section.cardamom", code: "" },
];

function buildHistory(rates) {
  const days = lastNDays(7);
  const crop = HISTORY_CROPS.find(c => rates.some(r => r[c.key] != null)) || null;
  if (!crop) return { crop: null, data: [], points: 0 };
  const data = days.map(k => {
    const top = rates
      .filter(r => dayKey(r.posted_at) === k)
      .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))[0];
    const price = top && top[crop.key] != null ? Number(top[crop.key]) : null;
    return { day: k.slice(5), price };
  });
  return { crop, data, points: data.filter(d => d.price != null).length };
}

export default function ProfilePage() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const knCls = lang === "kn" ? "kn" : "";
  const locale = lang === "kn" ? "kn-IN" : "en-IN";
  const nav = useNavigate();
  const { profile: me } = useAuth();
  const usersQ = useUsers();
  const ratesQ = useRates();
  const reviewsQ = useReviews();
  const addReview = useAddReview();
  const { trackView, trackLead } = useLeadTracking();
  const [showReview, setShowReview] = useState(false);

  const merchant = (usersQ.data || []).find(u => u.id === id && u.role === "MERCHANT");
  const myRates  = useMemo(() => (ratesQ.data || []).filter(r => r.merchant_id === id), [ratesQ.data, id]);
  const reviews  = useMemo(() => (reviewsQ.data || []).filter(r => r.merchant_id === id), [reviewsQ.data, id]);
  const latest   = useMemo(() => latestRateByMerchant(myRates)[0] || null, [myRates]);
  const history  = useMemo(() => buildHistory(myRates), [myRates]);

  useEffect(() => { if (merchant && me) trackView(merchant.id); }, [merchant?.id, !!me]); // eslint-disable-line

  if (usersQ.isLoading) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title", "Merchant Profile")}/>
        <div className={`p-6 text-center text-gray-500 ${knCls}`}>{t("common.loading")}</div>
      </div>
    );
  }
  if (!merchant) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title", "Merchant Profile")}/>
        <div className="p-6 text-center text-gray-500">{t("profile.notFound", "Merchant not found.")}</div>
      </div>
    );
  }
  if (getEffectiveStatus(merchant) !== "APPROVED" || merchant.is_disabled) {
    return (
      <div className="flex flex-col flex-1">
        <Header showBack title={t("profile.title", "Merchant Profile")}/>
        <div className="p-6 text-center text-gray-500">{t("profile.notVisible", "This merchant is not visible.")}</div>
      </div>
    );
  }

  const canSee = !!me;
  const canReview = !!me && me.role !== "MERCHANT";
  const avg = reviews.length ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10 : 0;
  const callPhone = latest?.contact_1_phone || merchant.phone;
  const waPhone   = latest?.contact_1_phone || merchant.whatsapp || merchant.phone;
  const spotLifting = !!(latest && (latest.rc_spot_lifting || latest.rc_old_spot_lifting));
  const hasRcNew = latest && (latest.rc_ep_price != null || latest.rc_spot_lift_price != null || latest.rc_delivery_price != null || latest.rc_moisture_pct != null);

  const contacts = [];
  if (latest) {
    for (const n of [1, 2, 3]) {
      const name = latest[`contact_${n}_name`];
      const phone = latest[`contact_${n}_phone`];
      if (name || phone) contacts.push({ name, phone });
    }
  }
  if (contacts.length === 0) contacts.push({ name: merchant.owner_name, phone: merchant.phone });

  function gate(fn) { if (!canSee) { nav("/login"); return; } fn(); }
  function onCall() { gate(() => { trackLead(merchant.id, "CALL"); window.location.href = `tel:${callPhone}`; }); }
  function onWa() {
    gate(() => {
      trackLead(merchant.id, "WHATSAPP");
      const num = (waPhone || "").replace(/[^0-9]/g, "");
      const msg = encodeURIComponent(`Namaste ${merchant.business_name}, I saw your rate on CoorgRate.`);
      window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
    });
  }

  return (
    <div className="flex flex-col flex-1 pb-10">
      <Header showBack title={t("profile.title", "Merchant Profile")}/>

      {/* 2. Identity */}
      <section className="px-4 py-5 border-b border-gray-100">
        <h2 className={`text-2xl font-bold text-gray-900 leading-tight ${knCls}`}>{merchant.business_name}</h2>
        {merchant.owner_name && <p className="text-sm text-gray-500 mt-1">{merchant.owner_name}</p>}
        <p className="text-sm text-gray-500">{merchant.town}{merchant.town && merchant.district ? ", " : ""}{merchant.district}</p>
        <div className="mt-3">
          <Badge tone="approved"><span className={knCls}>{t("profile.verifiedMerchant", "Verified Merchant")}</span></Badge>
        </div>
        {merchant.created_at && (
          <p className={`text-xs text-gray-400 mt-2 ${knCls}`}>
            {t("profile.memberSince", "Member since")} {new Date(merchant.created_at).toLocaleDateString(locale, { month: "long", year: "numeric" })}
          </p>
        )}
        <div className="mt-2 flex items-center gap-2">
          {reviews.length > 0 ? (
            <>
              <Stars value={avg} size={16}/>
              <span className={`text-sm text-gray-700 ${knCls}`}>
                {t("profile.ratingSummary", { defaultValue: "{{avg}} stars from {{count}} reviews", avg: avg.toFixed(1), count: reviews.length })}
              </span>
            </>
          ) : (
            <span className={`text-sm text-gray-400 ${knCls}`}>{t("review.noneYet")}</span>
          )}
        </div>
      </section>

      {/* 3. Today's rates */}
      <section className="px-4 pt-6">
        <SectionHeader kn={knCls}>{t("form.todaysRates", "Today's Rates")}</SectionHeader>
        {!latest ? (
          <Empty kn={knCls}>{t("profile.noRatesToday", "No rates posted today")}</Empty>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className={canSee ? "" : "blur-sm select-none pointer-events-none"}>
              {hasRcNew && (
                <CropGroup name={t("section.rc")} code="RC" kn={knCls}>
                  {latest.rc_ep_price != null        && <SubRow label="EP rate" value={formatINR(latest.rc_ep_price)} unit={t("card.perKg")}/>}
                  {latest.rc_spot_lift_price != null && <SubRow label="Spot lifting price" value={formatINR(latest.rc_spot_lift_price)} unit={t("card.perKg")}/>}
                  {latest.rc_delivery_price != null  && <SubRow label="Delivery price" value={formatINR(latest.rc_delivery_price)} unit={t("card.perKg")}/>}
                  {latest.rc_moisture_pct != null    && <SubRow label={t("card.moisture")} value={`${latest.rc_moisture_pct}%`}/>}
                </CropGroup>
              )}
              {latest.rc_old_ep_price != null && (
                <CropGroup name={t("section.rc")} code="RC" qualifier="old stock" kn={knCls}>
                  <SubRow label="EP rate" value={formatINR(latest.rc_old_ep_price)} unit={t("card.perKg")}/>
                </CropGroup>
              )}
              {latest.ot_price != null && <PriceRow name={t("section.ot")} value={formatINR(latest.ot_price)} unit={t("card.perKg")} kn={knCls}/>}
              {latest.ac_call_for_price
                ? <PriceRow name={t("section.ac")} code="AC" note={t("card.callForPrice", "Call for price")} kn={knCls}/>
                : latest.ac_price != null && <PriceRow name={t("section.ac")} code="AC" value={formatINR(latest.ac_price)} unit={t("card.perBag")} kn={knCls}/>}
              {latest.ap_price != null && <PriceRow name={t("section.ap")} code="AP" value={formatINR(latest.ap_price)} unit={t("card.perQuintal")} kn={knCls}/>}
              {latest.rp_price != null && <PriceRow name={t("section.rp")} code="RP" value={formatINR(latest.rp_price)} unit={t("card.perQuintal")} kn={knCls}/>}
              {latest.pepper_call_for_price
                ? <PriceRow name={t("section.pepper")} note={t("card.callForPrice", "Call for price")} kn={knCls}/>
                : latest.pepper_price != null && <PriceRow name={t("section.pepper")} value={formatINR(latest.pepper_price)} unit={t("card.perKg")} kn={knCls}/>}
              {latest.cardamom_price != null && <PriceRow name={t("section.cardamom")} value={formatINR(latest.cardamom_price)} unit={t("card.perKg")} kn={knCls}/>}

              {(latest.spot_payment || spotLifting) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {latest.spot_payment && <span className={`bg-coorg-600 text-white text-xs font-semibold px-3 py-1 rounded-full ${knCls}`}>{t("card.spotPay")}</span>}
                  {spotLifting && <span className={`bg-coorg-600 text-white text-xs font-semibold px-3 py-1 rounded-full ${knCls}`}>{t("card.spotLift")}</span>}
                </div>
              )}

              <div className="mt-3 border-t border-gray-100 pt-3 space-y-1">
                {latest.delivery_points?.length > 0 && <InfoLine label={t("form.deliveryPoints")} value={latest.delivery_points.join(", ")} kn={knCls}/>}
                {latest.valid_till && <InfoLine label={t("card.validTill")} value={formatTime12(latest.valid_till)} kn={knCls}/>}
                {latest.payment_mode && <InfoLine label={t("form.paymentMode")} value={t(`paymentMode.${latest.payment_mode}`, latest.payment_mode)} kn={knCls}/>}
              </div>
            </div>
            {!canSee && (
              <div className={`mt-3 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-600 ${knCls}`}>
                {t("feed.loginToSeeRates")}
              </div>
            )}
            <div className="mt-3 text-xs text-gray-400">
              {t("common.posted")}: {new Date(latest.posted_at).toLocaleString(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </div>
          </div>
        )}
      </section>

      {/* 4. Contact */}
      <section className="px-4 pt-8">
        <SectionHeader kn={knCls}>{t("card.contact", "Contact")}</SectionHeader>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <ul className="space-y-2">
            {contacts.map((c, idx) => (
              <li key={idx} className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-gray-800">{c.name || merchant.owner_name || "-"}</span>
                {canSee
                  ? <span className="text-sm font-semibold text-gray-900 tabular-nums">{c.phone || "-"}</span>
                  : <span className={`text-xs text-gray-400 ${knCls}`}>{t("feed.loginToContact")}</span>}
              </li>
            ))}
          </ul>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <button type="button" onClick={onCall}
              className={`min-h-[48px] rounded-xl border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm hover:bg-coorg-50 transition ${knCls}`}>
              {t("common.call")}
            </button>
            <button type="button" onClick={onWa}
              className={`min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition ${knCls}`}>
              {t("common.whatsapp")}
            </button>
          </div>
        </div>
      </section>

      {/* 5. Price history */}
      <section className="px-4 pt-8">
        <SectionHeader kn={knCls}>{t("profile.historyHeading", "Price History (Last 7 days)")}</SectionHeader>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          {history.points < 2 ? (
            <p className={`text-sm text-gray-500 text-center py-6 ${knCls}`}>{t("profile.notEnoughData", "Not enough data for history")}</p>
          ) : (
            <>
              <div className={`text-sm font-semibold text-gray-900 mb-3 ${knCls}`}>
                {t(history.crop.nameKey)}{history.crop.code ? <span className="text-gray-400 font-medium"> ({history.crop.code})</span> : null}
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={history.data} margin={{ top: 5, right: 8, bottom: 0, left: -12 }}>
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fontSize: 10, fill: "#6b7280" }} axisLine={false} tickLine={false} width={40}/>
                    <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}/>
                    <Bar dataKey="price" fill="#1f7d44" radius={[6, 6, 0, 0]} name={t(history.crop.nameKey)}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </section>

      {/* 6. Reviews */}
      <section className="px-4 pt-8">
        <SectionHeader kn={knCls}>{t("review.heading")} ({reviews.length})</SectionHeader>

        {canReview && (
          <>
            <button type="button" onClick={() => setShowReview(s => !s)}
              className={`w-full min-h-[48px] rounded-xl border-2 border-coorg-600 text-coorg-700 font-bold text-sm hover:bg-coorg-50 transition ${knCls}`}>
              {t("profile.leaveReview", "Leave a Review")}
            </button>
            {showReview && (
              <div className="mt-3">
                <ReviewForm
                  onCancel={() => setShowReview(false)}
                  onSubmit={async (p) => {
                    await addReview.mutateAsync({ merchantId: merchant.id, authorName: me.full_name || "Farmer", ...p });
                    setShowReview(false);
                  }}
                />
              </div>
            )}
          </>
        )}

        {reviews.length === 0 ? (
          <Empty kn={knCls}>{t("profile.noReviewsCta", "No reviews yet. Be the first to leave a review.")}</Empty>
        ) : (
          <ul className="mt-3 space-y-2">
            {reviews.map(r => (
              <li key={r.id} className="bg-white rounded-2xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-sm font-semibold text-gray-900 ${knCls}`}>
                    {t("profile.starsLabel", { defaultValue: "{{n}} stars", n: r.rating })}
                  </span>
                  <span className="text-xs text-gray-400">{new Date(r.created_at).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" })}</span>
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

function SectionHeader({ kn, children }) {
  return <h3 className={`text-base font-bold text-gray-900 mb-3 ${kn}`}>{children}</h3>;
}

function Empty({ kn, children }) {
  return <div className={`bg-white rounded-2xl border border-gray-200 p-6 text-center text-gray-500 ${kn}`}>{children}</div>;
}

function CropGroup({ name, code, qualifier, kn, children }) {
  return (
    <div className="py-1.5">
      <div className={`text-sm font-semibold text-gray-900 ${kn}`}>
        {name}{qualifier ? `, ${qualifier}` : ""}{code ? <span className="text-gray-400 font-medium"> ({code})</span> : null}
      </div>
      <div className="mt-1 pl-3 space-y-1">{children}</div>
    </div>
  );
}

function SubRow({ label, value, unit }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-xs text-gray-500">{label}</span>
      <span className="text-base font-bold text-coorg-700 tabular-nums">
        {value}{unit ? <span className="text-xs font-medium text-gray-400 ml-1">{unit}</span> : null}
      </span>
    </div>
  );
}

function PriceRow({ name, code, value, unit, note, kn }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className={`text-sm font-semibold text-gray-900 ${kn || ""}`}>
        {name}{code ? <span className="text-gray-400 font-medium"> ({code})</span> : null}
      </span>
      {note ? (
        <span className="text-sm font-semibold text-gray-500">{note}</span>
      ) : (
        <span className="text-lg font-bold text-coorg-700 tabular-nums">
          {value}<span className="text-xs font-medium text-gray-400 ml-1">{unit}</span>
        </span>
      )}
    </div>
  );
}

function InfoLine({ label, value, kn }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className={`text-gray-500 ${kn}`}>{label}:</span>
      <span className="font-medium text-gray-800 text-right">{value}</span>
    </div>
  );
}

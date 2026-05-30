import { useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Stars } from "../../components/icons/Stars";
import { Button } from "../../components/ui/Button";
import { formatINR } from "../../lib/constants";
import { useLeadTracking } from "../../hooks/useLeadTracking";
import { useSubmitReport } from "../admin/useReports";

export function RateCard({ merchant, rate, reviews = [], canSeeFull = true }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const knCls = lang === "kn" ? "kn" : "";
  const nav = useNavigate();
  const { trackLead } = useLeadTracking();
  const [revealed, setRevealed] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNotice, setReportNotice] = useState("");

  const avg = reviews.length
    ? Math.round((reviews.reduce((a, r) => a + r.rating, 0) / reviews.length) * 10) / 10
    : 0;

  const callPhone = rate.contact_1_phone || merchant.phone;
  const waPhone   = rate.contact_1_phone || merchant.whatsapp || merchant.phone;

  function gate(e, onAllow) {
    e.preventDefault(); e.stopPropagation();
    if (!canSeeFull) { nav("/login"); return; }
    onAllow?.();
  }
  function onShow(e) {
    gate(e, () => {
      if (!revealed) {
        setRevealed(true);
        trackLead(merchant.id, "SHOW_NUMBER");
      }
    });
  }
  function onCall(e) {
    gate(e, () => {
      trackLead(merchant.id, "CALL");
      window.location.href = `tel:${callPhone}`;
    });
  }
  function onWa(e) {
    gate(e, () => {
      trackLead(merchant.id, "WHATSAPP");
      const msg = encodeURIComponent(`Namaste ${merchant.business_name}, I saw your rate on CoorgRate.`);
      const num = (waPhone || "").replace(/[^0-9]/g, "");
      window.open(`https://wa.me/${num}?text=${msg}`, "_blank");
    });
  }

  const spotLifting = !!(rate.rc_spot_lifting || rate.rc_old_spot_lifting);
  const hasRcNew = rate.rc_ep_price != null || rate.rc_spot_lift_price != null || rate.rc_delivery_price != null || rate.rc_moisture_pct != null;
  const blurCls = canSeeFull ? "" : "blur-sm select-none pointer-events-none";

  return (
    <Link to={`/merchant/${merchant.id}`} onClick={(e) => { if (!canSeeFull) { e.preventDefault(); nav("/login"); } }} className="block">
      <article className="bg-white rounded-2xl border border-gray-200 p-5 hover:border-gray-300 transition">
        {/* 1 + 2. Merchant identity */}
        <h3 className={`text-xl font-bold text-gray-900 leading-tight ${knCls}`}>{merchant.business_name}</h3>
        <p className="text-sm text-gray-500 mt-1">
          {merchant.town}{merchant.town && merchant.district ? ", " : ""}{merchant.district}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {reviews.length > 0 ? (
            <>
              <Stars value={avg} size={15}/>
              <span className="text-sm font-semibold text-gray-700 tabular-nums">{avg.toFixed(1)}</span>
              <span className="text-sm text-gray-400">({reviews.length})</span>
            </>
          ) : (
            <span className={`text-sm text-gray-400 ${knCls}`}>{t("review.noneYet")}</span>
          )}
        </div>

        {/* 3. Prices */}
        <div className={`mt-4 border-t border-gray-100 pt-3 ${blurCls}`}>
          {hasRcNew && (
            <CropGroup name={t("section.rc")} code="RC" kn={knCls}>
              {rate.rc_ep_price != null     && <SubRow label="EP rate" value={formatINR(rate.rc_ep_price)} unit={t("card.perKg")}/>}
              {rate.rc_spot_lift_price != null && <SubRow label="Spot lifting price" value={formatINR(rate.rc_spot_lift_price)} unit={t("card.perKg")}/>}
              {rate.rc_delivery_price != null  && <SubRow label="Delivery price" value={formatINR(rate.rc_delivery_price)} unit={t("card.perKg")}/>}
              {rate.rc_moisture_pct != null    && <SubRow label={t("card.moisture")} value={`${rate.rc_moisture_pct}%`}/>}
            </CropGroup>
          )}

          {rate.rc_old_ep_price != null && (
            <CropGroup name={t("section.rc")} code="RC" qualifier="old stock" kn={knCls}>
              <SubRow label="EP rate" value={formatINR(rate.rc_old_ep_price)} unit={t("card.perKg")}/>
            </CropGroup>
          )}

          {rate.ot_price != null && (
            <PriceRow name={t("section.ot")} value={formatINR(rate.ot_price)} unit={t("card.perKg")} kn={knCls}/>
          )}

          {rate.ac_call_for_price ? (
            <PriceRow name={t("section.ac")} code="AC" note={t("card.callForPrice", "Call for price")} kn={knCls}/>
          ) : rate.ac_price != null ? (
            <PriceRow name={t("section.ac")} code="AC" value={formatINR(rate.ac_price)} unit={t("card.perBag")} kn={knCls}/>
          ) : null}

          {rate.ap_price != null && (
            <PriceRow name={t("section.ap")} code="AP" value={formatINR(rate.ap_price)} unit={t("card.perQuintal")} kn={knCls}/>
          )}

          {rate.rp_price != null && (
            <PriceRow name={t("section.rp")} code="RP" value={formatINR(rate.rp_price)} unit={t("card.perQuintal")} kn={knCls}/>
          )}

          {rate.pepper_call_for_price ? (
            <PriceRow name={t("section.pepper")} note={t("card.callForPrice", "Call for price")} kn={knCls}/>
          ) : rate.pepper_price != null ? (
            <PriceRow name={t("section.pepper")} value={formatINR(rate.pepper_price)} unit={t("card.perKg")} kn={knCls}/>
          ) : null}

          {rate.cardamom_price != null && (
            <PriceRow name={t("section.cardamom")} value={formatINR(rate.cardamom_price)} unit={t("card.perKg")} kn={knCls}/>
          )}
        </div>

        {/* 4. Key badges */}
        {(rate.spot_payment || spotLifting) && (
          <div className="mt-4 flex flex-wrap gap-2">
            {rate.spot_payment && (
              <span className={`bg-coorg-600 text-white text-xs font-semibold px-3 py-1 rounded-full ${knCls}`}>{t("card.spotPay")}</span>
            )}
            {spotLifting && (
              <span className={`bg-coorg-600 text-white text-xs font-semibold px-3 py-1 rounded-full ${knCls}`}>{t("card.spotLift")}</span>
            )}
          </div>
        )}

        {!canSeeFull && (
          <div className="mt-4 rounded-xl bg-gray-50 border border-gray-200 px-4 py-3 text-center text-sm font-semibold text-gray-600">
            <span className={knCls}>{t("feed.loginToContact")}</span>
          </div>
        )}

        {/* Phone reveal (preserves Show Number lead tracking) */}
        {canSeeFull && (
          revealed ? (
            <div className="mt-4 text-center text-sm text-gray-700">
              <span className="font-semibold text-gray-900 tabular-nums">{callPhone}</span>
            </div>
          ) : (
            <button type="button" onClick={onShow}
              className={`mt-4 w-full min-h-[48px] rounded-xl text-sm font-semibold text-coorg-700 hover:bg-coorg-50 transition ${knCls}`}>
              {t("common.showNumber")}
            </button>
          )
        )}

        {/* 5. Contact row */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          <button type="button" onClick={onCall}
            className={`min-h-[48px] rounded-xl border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm hover:bg-coorg-50 transition ${knCls}`}>
            {t("common.call")}
          </button>
          <button type="button" onClick={onWa}
            className={`min-h-[48px] rounded-xl bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition ${knCls}`}>
            {t("common.whatsapp")}
          </button>
        </div>

        {/* 6. Posted time */}
        <div className="mt-4 text-xs text-gray-400">
          {t("common.posted")}: {new Date(rate.posted_at).toLocaleString(lang === "kn" ? "kn-IN" : "en-IN", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>

        {/* 7. Report link */}
        <div className="mt-2 flex justify-end">
          <button type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!canSeeFull) { setReportNotice(t("report.loginRequired")); return; }
              setReportNotice("");
              setReportOpen(true);
            }}
            className={`text-xs text-gray-400 hover:text-gray-600 underline ${knCls}`}>
            {t("report.link")}
          </button>
        </div>
        {reportNotice && <div className="mt-1 text-xs text-gray-500 text-right">{reportNotice}</div>}
      </article>

      {reportOpen && createPortal(
        <ReportModal merchant={merchant} onClose={() => setReportOpen(false)}/>,
        document.body
      )}
    </Link>
  );
}

function CropGroup({ name, code, qualifier, kn, children }) {
  return (
    <div className="py-1.5">
      <div className={`text-sm font-semibold text-gray-900 ${kn}`}>
        {name}{qualifier ? `, ${qualifier}` : ""}{code ? <span className="text-gray-400 font-medium"> ({code})</span> : null}
      </div>
      <div className="mt-1 pl-3 space-y-1">
        {children}
      </div>
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

function ReportModal({ merchant, onClose }) {
  const { t, i18n } = useTranslation();
  const knCls = i18n.language === "kn" ? "kn" : "";
  const [reason, setReason] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const submit = useSubmitReport();
  const tooShort = reason.trim().length < 10;

  function stop(e) { e.preventDefault(); e.stopPropagation(); }

  async function onSubmit(e) {
    stop(e);
    if (tooShort || submit.isPending) return;
    setErr("");
    try {
      await submit.mutateAsync({ merchantId: merchant.id, reason: reason.trim() });
      setDone(true);
    } catch (e) {
      const msg = e.message?.startsWith("report.") ? t(e.message) : e.message;
      setErr(msg || "Error");
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center"
      onClick={(e) => { stop(e); onClose(); }}>
      <div
        className="w-full max-w-[430px] bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 sm:m-4"
        onClick={stop}>
        {done ? (
          <>
            <p className={`text-sm text-gray-800 ${knCls}`}>{t("report.success")}</p>
            <div className="mt-4 flex justify-end">
              <Button size="md" variant="primary" onClick={(e) => { stop(e); onClose(); }}>
                <span className={knCls}>{t("report.cancel")}</span>
              </Button>
            </div>
          </>
        ) : (
          <>
            <h3 className={`text-lg font-extrabold text-gray-900 ${knCls}`}>{t("report.title")}</h3>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{merchant.business_name}</p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={4}
              minLength={10}
              required
              placeholder={t("report.reasonPlaceholder")}
              className="mt-3 w-full rounded-xl border-2 border-gray-200 focus:border-coorg-500 outline-none px-3 py-2 text-sm"
            />
            <div className="mt-1 text-xs text-gray-400 tabular-nums">{reason.trim().length}/10</div>
            {err && <div className="mt-2 text-xs text-red-600 font-semibold">{err}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <Button size="md" variant="subtle" onClick={(e) => { stop(e); onClose(); }}>
                <span className={knCls}>{t("report.cancel")}</span>
              </Button>
              <Button size="md" variant="primary" disabled={tooShort} loading={submit.isPending} onClick={onSubmit}>
                <span className={knCls}>{t("report.submit")}</span>
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

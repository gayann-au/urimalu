import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../hooks/useUiStore";
import "./LandingPage.css";

// Urimalu marketing landing page, redesigned as a bilingual "market morning"
// poster. Static marketing content only, no live data anywhere: the page sells
// the product without ever showing a price that could go stale. Every visible
// string flows through i18next so Kannada and English stay in lockstep.
//
// Structure: typographic hero, tilted crop ticker band, three step walkthrough,
// a dark price alerts stage with an animated threshold crossing demo, farmer
// and merchant split panels, trust pillars, and the closing chilli CTA. The
// header and footer are unchanged from the previous version. All motion
// collapses to plain fades when the visitor prefers reduced motion.

// Links rendered as motion components so buttons can lift and press.
const MotionLink = motion.create(Link);

// Shared easing, matches the --ease-out token used across the stylesheet.
const EASE = [0.22, 0.61, 0.36, 1];

const TICKER_CROPS = ["robusta", "arabica", "pepper", "cardamom", "arecanut"];

const arrow = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);
const check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);
const bell = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);

// The brand chilli glyph, reused as eyebrow dot and ticker separator.
function ChilliMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 40 48" fill="none" aria-hidden="true">
      <path d="M26.8 12.5c1-3 .2-5.6-2.4-6.9" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
    </svg>
  );
}

// Animated price alerts demo. An abstract posted-price line climbs across a
// dashed target threshold, and the moment it crosses, a push notification
// card springs into the phone frame. Purely illustrative and free of numbers,
// so nothing on it can ever look stale. Decorative, hidden from readers.
function AlertPhone({ t, reduce }) {
  const ref = useRef(null);
  const show = useInView(ref, { once: true, amount: 0.4 });
  const line = {
    hidden: { pathLength: 0 },
    show: { pathLength: 1, transition: { duration: reduce ? 0 : 1.5, ease: EASE, delay: reduce ? 0 : 0.25 } },
  };
  const cross = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.3, delay: reduce ? 0 : 1.05 } },
  };
  const notif = {
    hidden: { opacity: 0, y: reduce ? 0 : 22, scale: reduce ? 1 : 0.95 },
    show: {
      opacity: 1, y: 0, scale: 1,
      transition: reduce
        ? { duration: 0.4, delay: 0.1 }
        : { type: "spring", stiffness: 250, damping: 21, delay: 1.35 },
    },
  };
  return (
    <div className="phone-stage" ref={ref} aria-hidden="true">
      <motion.div className="phone" initial="hidden" animate={show ? "show" : "hidden"}>
        <div className="phone-notch" />
        <div className="phone-chart">
          <svg viewBox="0 0 340 168" fill="none" preserveAspectRatio="none">
            <line x1="10" y1="64" x2="330" y2="64" className="target-line" strokeWidth="2" strokeDasharray="7 7" strokeLinecap="round" />
            <motion.path
              className="price-line"
              d="M12 142 C 52 132, 84 138, 116 120 C 150 101, 178 106, 208 86 C 236 67, 262 52, 292 40 C 306 34, 318 30, 328 27"
              strokeWidth="3.5" strokeLinecap="round"
              variants={line}
            />
            <motion.g variants={cross}>
              <circle className="cross-ring" cx="224" cy="64" r="7" />
              <circle className="cross-dot" cx="224" cy="64" r="5.5" />
            </motion.g>
          </svg>
          <span className="target-chip">{t("landing.alerts.targetLabel")}</span>
        </div>
        <motion.div className="notif" variants={notif}>
          <span className="notif-ic">{bell}</span>
          <span className="notif-body">
            <span className="notif-top">
              <b>{t("landing.alerts.notifApp")}</b>
              <i>{t("landing.alerts.notifTime")}</i>
            </span>
            <span className="notif-title">{t("landing.alerts.notifTitle")}</span>
            <span className="notif-text">{t("landing.alerts.notifBody")}</span>
          </span>
        </motion.div>
        <p className="phone-caption">{t("landing.alerts.chartCaption")}</p>
      </motion.div>
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);

  // Sticky header gains a hairline border once the page is scrolled past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Motion variants. When reduced motion is requested we drop the travel and
  // keep only a gentle opacity change so nothing slides around.
  const fadeUp = {
    hidden: { opacity: 0, y: reduce ? 0 : 22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  };
  const stagger = {
    hidden: {},
    show: {
      transition: { staggerChildren: reduce ? 0 : 0.09, delayChildren: 0.05 },
    },
  };
  const popIn = {
    hidden: { opacity: 0, y: reduce ? 0 : 30, scale: reduce ? 1 : 0.98 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.7, ease: EASE } },
  };

  // Hover and tap reactions. Spring physics give them the springy SaaS feel.
  const cardHover = reduce
    ? undefined
    : { y: -6, transition: { type: "spring", stiffness: 320, damping: 22 } };
  const btnHover = reduce
    ? undefined
    : { y: -2, transition: { type: "spring", stiffness: 420, damping: 18 } };
  const btnTap = reduce ? undefined : { scale: 0.97 };

  // Viewport config so each block animates once, when comfortably in view.
  const inView = { once: true, amount: 0.2 };

  const steps = [
    {
      key: "s1",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7.5 3.5h6.7a2 2 0 0 1 1.4.6l5.3 5.3a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0l-5.3-5.3a2 2 0 0 1-.6-1.4V5.5a2 2 0 0 1 2-2Z" /><circle cx="10" cy="8" r="1.4" />
        </svg>
      ),
    },
    {
      key: "s2",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="18" y1="20" x2="18" y2="4" />
        </svg>
      ),
    },
    {
      key: "s3",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 18l1 3a2 2 0 0 1-2 2 16 16 0 0 1-16-16 2 2 0 0 1 2-2Z" />
        </svg>
      ),
    },
  ];

  const trustCards = [
    {
      key: "t1",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" /><path d="m9 12 2 2 4-4" />
        </svg>
      ),
    },
    {
      key: "t2",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 18l1 3a2 2 0 0 1-2 2 16 16 0 0 1-16-16 2 2 0 0 1 2-2Z" />
        </svg>
      ),
    },
    {
      key: "t3",
      icon: <span className="ab-glyph" aria-hidden="true">ಅ<i>A</i></span>,
    },
  ];

  return (
    <div className="uri-landing">
      {/* Header */}
      <motion.header
        className={`hdr${scrolled ? " scrolled" : ""}`}
        initial={{ opacity: 0, y: reduce ? 0 : -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <div className="wrap hdr-in">
          <Link className="brand" to="/" aria-label="Urimalu home">
            <img src="/icons/logo-urimalu.png" alt="Urimalu" style={{ height: "36px", width: "auto" }} />
          </Link>
          <div className="hdr-right">
            <Link className="login-link" to="/login">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" />
              </svg>
              Log in
            </Link>
          </div>
        </div>
      </motion.header>

      <main>
        {/* Hero, pure typography on the paper stage. No price card here: any
            hardcoded number would read wrong the day it goes stale. */}
        <section className="hero">
          <div className="wrap">
            <motion.div className="hero-copy" variants={stagger} initial="hidden" animate="show">
              <motion.div className="lang-row" variants={fadeUp}>
                <div className="lang-pill" role="group" aria-label={t("landing.lang.label")}>
                  <button type="button" className={lang === "kn" ? "on" : ""} onClick={() => setLang("kn")}>
                    {t("landing.lang.kn")}
                  </button>
                  <button type="button" className={lang === "en" ? "on" : ""} onClick={() => setLang("en")}>
                    {t("landing.lang.en")}
                  </button>
                </div>
              </motion.div>
              <motion.span className="eyebrow pill" variants={fadeUp}>
                <ChilliMark className="dot" />
                {t("landing.hero.eyebrow")}
              </motion.span>
              <motion.h1 variants={fadeUp}>
                {t("landing.hero.titleA")}<br />
                <span className="fire">{t("landing.hero.titleB")}</span>
              </motion.h1>
              <motion.p className="hero-sub" variants={fadeUp}>{t("landing.hero.sub")}</motion.p>
              <motion.div className="btn-row hero-btns" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.hero.ctaFarmer")}{arrow}
                </MotionLink>
                <MotionLink className="btn btn-ink" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.hero.ctaMerchant")}{arrow}
                </MotionLink>
              </motion.div>
              <motion.div className="hero-trust" variants={fadeUp}>
                <span className="tc">{check}</span>
                {t("landing.hero.trust")}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Crop ticker, a slowly drifting band of what trades here. Names only,
            never prices. The second set is a duplicate for the seamless loop. */}
        <section className="ticker" aria-label={t("landing.ticker.ariaLabel")}>
          <div className="ticker-tilt">
            <div className="ticker-move">
              {[0, 1].map((dup) => (
                <div className="ticker-set" key={dup} aria-hidden={dup === 1 ? "true" : undefined}>
                  {TICKER_CROPS.map((crop) => (
                    <span className="tick" key={crop}>
                      <ChilliMark className="tick-mark" />
                      {t(`landing.ticker.${crop}`)}
                      <em>{t("landing.ticker.region")}</em>
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="sec-pad how">
          <div className="wrap">
            <motion.div className="sec-head" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>{t("landing.how.eyebrow")}</motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.how.title")}</motion.h2>
            </motion.div>
            <motion.div className="steps" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              {steps.map((step, i) => (
                <motion.div className="step" key={step.key} variants={fadeUp} whileHover={cardHover}>
                  <span className="step-ghost" aria-hidden="true">{`0${i + 1}`}</span>
                  <div className="step-ic">{step.icon}</div>
                  <div className="step-t">{t(`landing.how.${step.key}t`)}</div>
                  <p className="step-d">{t(`landing.how.${step.key}d`)}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Price alerts, the differentiator, on a dark stage of its own. */}
        <section className="alerts-stage">
          <div className="wrap alerts-grid">
            <motion.div className="alerts-copy" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow on-ink" variants={fadeUp}>
                <ChilliMark className="dot" />
                {t("landing.alerts.eyebrow")}
              </motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.alerts.title")}</motion.h2>
              <motion.p className="alerts-body" variants={fadeUp}>{t("landing.alerts.body")}</motion.p>
              <motion.ul className="alerts-list" variants={fadeUp}>
                {["b1", "b2", "b3"].map((b) => (
                  <li key={b}><span className="chk">{check}</span>{t(`landing.alerts.${b}`)}</li>
                ))}
              </motion.ul>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.alerts.cta")}{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
            <motion.div variants={popIn} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
              <AlertPhone t={t} reduce={reduce} />
            </motion.div>
          </div>
        </section>

        {/* For farmers and merchants */}
        <section className="sec-pad">
          <div className="wrap">
            <motion.div className="sec-head" style={{ marginBottom: "46px" }} variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>{t("landing.sides.eyebrow")}</motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.sides.title")}</motion.h2>
            </motion.div>
            <motion.div className="split" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              {/* Farmers */}
              <motion.div className="panel panel-farmer" variants={popIn} whileHover={cardHover}>
                <ChilliMark className="panel-chilli-bg" />
                <span className="panel-tag">
                  <span className="pic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
                    </svg>
                  </span>{t("landing.sides.farmerTag")}
                </span>
                <h3>{t("landing.sides.farmerTitle")}</h3>
                <p className="lede">{t("landing.sides.farmerLede")}</p>
                <ul>
                  {["f1", "f2", "f3"].map((f) => (
                    <li key={f}><span className="chk">{check}</span>{t(`landing.sides.${f}`)}</li>
                  ))}
                </ul>
                <div className="panel-foot">
                  <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                    {t("landing.sides.farmerCta")}{arrow}
                  </MotionLink>
                </div>
              </motion.div>
              {/* Merchants */}
              <motion.div className="panel panel-merchant" variants={popIn} whileHover={cardHover}>
                <ChilliMark className="panel-chilli-bg" />
                <span className="panel-tag">
                  <span className="pic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 9 5 4h14l2 5" /><path d="M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" /><path d="M9 9v3a3 3 0 0 0 6 0V9" />
                    </svg>
                  </span>{t("landing.sides.merchantTag")}
                </span>
                <h3>{t("landing.sides.merchantTitle")}</h3>
                <p className="lede">{t("landing.sides.merchantLede")}</p>
                <ul>
                  {["m1", "m2", "m3"].map((m) => (
                    <li key={m}><span className="chk">{check}</span>{t(`landing.sides.${m}`)}</li>
                  ))}
                </ul>
                <div className="panel-foot">
                  <MotionLink className="btn btn-light" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                    {t("landing.sides.merchantCta")}{arrow}
                  </MotionLink>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Trust pillars */}
        <section className="sec-pad trust">
          <div className="wrap">
            <motion.div className="sec-head center" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>{t("landing.trust.eyebrow")}</motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.trust.title")}</motion.h2>
            </motion.div>
            <motion.div className="trust-grid" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              {trustCards.map((card) => (
                <motion.div className="trust-card" key={card.key} variants={fadeUp} whileHover={cardHover}>
                  <div className="trust-ic">{card.icon}</div>
                  <h3>{t(`landing.trust.${card.key}t`)}</h3>
                  <p>{t(`landing.trust.${card.key}d`)}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="wrap" style={{ paddingBottom: "clamp(64px,9vw,112px)" }}>
          <motion.div className="cta" variants={popIn} initial="hidden" whileInView="show" viewport={inView}>
            <motion.div className="cta-in" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow on-ink" variants={fadeUp}>
                <ChilliMark className="dot" />
                {t("landing.cta.eyebrow")}
              </motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.cta.title")}</motion.h2>
              <motion.p variants={fadeUp}>{t("landing.cta.body")}</motion.p>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.cta.ctaFarmer")}{arrow}
                </MotionLink>
                <MotionLink className="btn btn-outline-light" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.cta.ctaMerchant")}{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <motion.footer className="ft" initial="hidden" whileInView="show" viewport={inView} variants={fadeUp}>
        <div className="wrap ft-in">
          <div>
            <div className="ft-brand">
              <img src="/icons/logo-urimalu.png" alt="Urimalu" style={{ height: "31px", width: "auto" }} />
            </div>
            <p className="ft-tag">Real daily crop prices, shared between the people who grow and the people who buy.</p>
          </div>
          <div className="ft-links">
            <Link to="/signup/farmer">Farmers</Link>
            <Link to="/signup/merchant">Merchants</Link>
            <Link to="/login">Log in</Link>
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
          </div>
        </div>
        <div className="wrap">
          <div className="ft-bottom">
            <span>&copy; 2026 Urimalu. Small but fiery.</span>
            <span>Made for farmers and merchants.</span>
          </div>
        </div>
      </motion.footer>
    </div>
  );
}

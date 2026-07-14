import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../hooks/useUiStore";
import "./LandingPage.css";

// Urimalu marketing landing page. One narrative, told in order: within five
// seconds the farmer feels what not knowing the price costs, within fifteen
// they understand exactly what the app does, within thirty they want in.
//
// Sections, each with one job:
//   Hero          the power shift in one read, farmer CTA first
//   Two mornings  the same day with and without the app, the 15 second explainer
//   Price alerts  the centrepiece: the phone lights up before you leave home
//   Merchants     one rate posted, every grower of that crop reached
//   Closing       the ask, with a quiet line about the app being free and
//                 growing around the people who use it
//
// No live data anywhere, so nothing can ever look stale. All visible strings
// flow through i18next. Header and footer are unchanged. Every animation
// collapses to a plain fade when the visitor prefers reduced motion.

// Links rendered as motion components so buttons can lift and press.
const MotionLink = motion.create(Link);

// Shared easing, matches the --ease-out token used across the stylesheet.
const EASE = [0.22, 0.61, 0.36, 1];

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
const cross = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
  </svg>
);
const bell = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
const bullhorn = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11v2a2 2 0 0 0 2 2h1l3 5v-9" /><path d="M6 11 18 5v14L6 13" /><path d="M21 9v6" />
  </svg>
);

// The brand chilli glyph, used as the eyebrow dot.
function ChilliMark({ className }) {
  return (
    <svg className={className} viewBox="0 0 40 48" fill="none" aria-hidden="true">
      <path d="M26.8 12.5c1-3 .2-5.6-2.4-6.9" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
    </svg>
  );
}

// The price alert moment, staged like the morning it describes. The dashed
// line is the price the farmer named. The green line is the market climbing.
// The instant they cross, the notification lands, and the kicker under the
// phone makes the point: all of this happened before the first coffee.
// Purely illustrative, no numbers, decorative and hidden from readers.
function AlertPhone({ t, reduce }) {
  const ref = useRef(null);
  const show = useInView(ref, { once: true, amount: 0.45 });
  const line = {
    hidden: { pathLength: 0 },
    show: { pathLength: 1, transition: { duration: reduce ? 0 : 1.5, ease: EASE, delay: reduce ? 0 : 0.3 } },
  };
  const crossPop = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.3, delay: reduce ? 0 : 1.15 } },
  };
  const notif = {
    hidden: { opacity: 0, y: reduce ? 0 : 24, scale: reduce ? 1 : 0.94 },
    show: {
      opacity: 1, y: 0, scale: 1,
      transition: reduce
        ? { duration: 0.4, delay: 0.1 }
        : { type: "spring", stiffness: 240, damping: 20, delay: 1.5 },
    },
  };
  const kicker = {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE, delay: reduce ? 0.2 : 2.3 } },
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
            <motion.g variants={crossPop}>
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
      </motion.div>
      <motion.p className="after-line" variants={kicker} initial="hidden" animate={show ? "show" : "hidden"}>
        {t("landing.alerts.after")}
      </motion.p>
    </div>
  );
}

// One post radiating out to every grower of that crop. The rate leaves the
// centre once and the dots, the farmers, light up in waves. Decorative.
function ReachMap({ reduce }) {
  const rings = [48, 84, 120];
  const dots = [
    [218, 96], [128, 158],
    [170, 36], [86, 120], [248, 176],
    [66, 58], [286, 86], [152, 226],
  ];
  const ring = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { duration: 0.8, ease: EASE } },
  };
  const dot = {
    hidden: { r: 0, opacity: 0 },
    show: { r: 7, opacity: 1, transition: { duration: reduce ? 0.3 : 0.45, ease: EASE } },
  };
  const wave = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.14, delayChildren: reduce ? 0 : 0.5 } },
  };
  return (
    <motion.svg
      className="reach-svg" viewBox="0 0 340 240" fill="none" aria-hidden="true"
      initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.4 }}
    >
      {rings.map((r) => (
        <motion.circle key={r} className="reach-ring" cx="170" cy="120" r={r} variants={ring} />
      ))}
      <motion.g variants={wave}>
        {dots.map(([x, y], i) => (
          <motion.circle key={i} className={`reach-dot${i % 3 === 2 ? " warm" : ""}`} cx={x} cy={y} variants={dot} />
        ))}
      </motion.g>
      <motion.g variants={ring}>
        <circle className="reach-core" cx="170" cy="120" r="26" />
        <g transform="translate(158.5,108.5)" className="reach-tag">
          <path d="M7.2 3.4h6.3a1.9 1.9 0 0 1 1.3.55l5 5a1.9 1.9 0 0 1 0 2.65l-6.1 6.1a1.9 1.9 0 0 1-2.65 0l-5-5a1.9 1.9 0 0 1-.55-1.3V5.3a1.9 1.9 0 0 1 1.9-1.9Z" />
          <circle cx="9.6" cy="7.7" r="1.3" />
        </g>
      </motion.g>
    </motion.svg>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const lang = useUiStore(s => s.lang);
  const toggleLang = useUiStore(s => s.toggleLang);

  // Sticky header gains a hairline border once the page is scrolled past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Motion variants. Reduced motion drops the travel and blur and keeps only
  // a gentle opacity change so nothing slides around.
  const fadeUp = {
    hidden: { opacity: 0, y: reduce ? 0 : 22 },
    show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  };
  const headline = {
    hidden: { opacity: 0, y: reduce ? 0 : 30, filter: reduce ? "blur(0px)" : "blur(8px)" },
    show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.75, ease: EASE } },
  };
  const stagger = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.1, delayChildren: 0.05 } },
  };
  const cardIn = {
    hidden: { opacity: 0, y: reduce ? 0 : 28, scale: reduce ? 1 : 0.985 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.65, ease: EASE } },
  };
  const btnHover = reduce
    ? undefined
    : { y: -2, transition: { type: "spring", stiffness: 420, damping: 18 } };
  const btnTap = reduce ? undefined : { scale: 0.97 };
  const inView = { once: true, amount: 0.25 };

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
            <button className="lang-toggle" onClick={toggleLang} aria-label="Toggle language">
              {lang === "kn" ? "ಕ·EN" : "EN·ಕ"}
            </button>
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
        {/* Hero. The five second job: the merchant has the number, now so do
            you. Farmer CTA carries the weight, the merchant path is a quiet
            link so the hierarchy stays honest. */}
        <section className="hero">
          <div className="wrap">
            <motion.div className="hero-copy" variants={stagger} initial="hidden" animate="show">
              <motion.span className="eyebrow pill" variants={fadeUp}>
                <ChilliMark className="dot" />
                {t("landing.hero.eyebrow")}
              </motion.span>
              <h1>
                <motion.span className="h-line" variants={headline}>{t("landing.hero.titleA")}</motion.span>
                <motion.span className="h-line fire" variants={headline}>{t("landing.hero.titleB")}</motion.span>
              </h1>
              <motion.p className="hero-sub" variants={fadeUp}>{t("landing.hero.sub")}</motion.p>
              <motion.div className="hero-actions" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.hero.ctaFarmer")}{arrow}
                </MotionLink>
                <Link className="link-quiet" to="/signup/merchant">
                  {t("landing.hero.ctaMerchant")}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </Link>
              </motion.div>
              <motion.div className="hero-trust" variants={fadeUp}>
                <span className="tc">{check}</span>
                {t("landing.hero.trust")}
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Two mornings. The fifteen second job: the same day, side by side.
            The muted card is the morning everyone knows. The bright one is
            the morning this app makes, and it arrives second on purpose. */}
        <section className="sec-pad mornings">
          <div className="wrap">
            <motion.div className="sec-head center" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>{t("landing.mornings.eyebrow")}</motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.mornings.title")}</motion.h2>
            </motion.div>
            <motion.div className="mornings-grid" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.div className="m-card m-without" variants={cardIn}>
                <span className="m-tag">{t("landing.mornings.withoutTag")}</span>
                <h3>{t("landing.mornings.withoutTitle")}</h3>
                <motion.ul variants={stagger}>
                  {["w1", "w2", "w3"].map((k) => (
                    <motion.li key={k} variants={fadeUp}>
                      <span className="mk mk-x">{cross}</span>{t(`landing.mornings.${k}`)}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
              <motion.div className="m-card m-with" variants={cardIn}>
                <span className="m-tag">{t("landing.mornings.withTag")}</span>
                <h3>{t("landing.mornings.withTitle")}</h3>
                <motion.ul variants={stagger}>
                  {["g1", "g2", "g3"].map((k) => (
                    <motion.li key={k} variants={fadeUp}>
                      <span className="mk mk-c">{check}</span>{t(`landing.mornings.${k}`)}
                    </motion.li>
                  ))}
                </motion.ul>
              </motion.div>
            </motion.div>
            <motion.p className="m-shift" variants={fadeUp} initial="hidden" whileInView="show" viewport={inView}>
              {t("landing.mornings.shift")}
            </motion.p>
            <motion.div className="reverse-strip" variants={cardIn} initial="hidden" whileInView="show" viewport={inView}>
              <span className="reverse-ic">{bullhorn}</span>
              <div className="reverse-copy">
                <span className="reverse-kicker">{t("landing.mornings.reverseKicker")}</span>
                <p className="reverse-title">{t("landing.mornings.reverseTitle")}</p>
                <p className="reverse-body">{t("landing.mornings.reverseBody")}</p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Price alerts, the centrepiece, on a dark stage of its own. */}
        <section className="alerts-stage">
          <div className="wrap alerts-grid">
            <motion.div className="alerts-copy" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow on-ink" variants={fadeUp}>
                <ChilliMark className="dot" />
                {t("landing.alerts.eyebrow")}
              </motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.alerts.title")}</motion.h2>
              <motion.p className="alerts-body" variants={fadeUp}>{t("landing.alerts.body")}</motion.p>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.alerts.cta")}{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
            <motion.div variants={cardIn} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
              <AlertPhone t={t} reduce={reduce} />
            </motion.div>
          </div>
        </section>

        {/* Merchants. One job: convey reach. One rate, every grower. */}
        <section className="sec-pad reach">
          <div className="wrap reach-grid">
            <motion.div variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>{t("landing.merchants.eyebrow")}</motion.span>
              <motion.h2 className="reach-title" variants={fadeUp}>{t("landing.merchants.title")}</motion.h2>
              <motion.p className="reach-body" variants={fadeUp}>{t("landing.merchants.body")}</motion.p>
              <motion.ul className="reach-list" variants={stagger}>
                {["m1", "m2", "m3"].map((k) => (
                  <motion.li key={k} variants={fadeUp}>
                    <span className="mk mk-c">{check}</span>{t(`landing.merchants.${k}`)}
                  </motion.li>
                ))}
              </motion.ul>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-ink" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.merchants.cta")}{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
            <ReachMap reduce={reduce} />
          </div>
        </section>

        {/* Closing. The ask, then the quiet fact underneath it. */}
        <section className="wrap closing">
          <motion.div className="cta" variants={cardIn} initial="hidden" whileInView="show" viewport={inView}>
            <motion.div className="cta-in" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow on-ink" variants={fadeUp}>
                <ChilliMark className="dot" />
                {t("landing.closing.eyebrow")}
              </motion.span>
              <motion.h2 variants={fadeUp}>{t("landing.closing.title")}</motion.h2>
              <motion.p variants={fadeUp}>{t("landing.closing.body")}</motion.p>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.closing.ctaFarmer")}{arrow}
                </MotionLink>
                <MotionLink className="btn btn-outline-light" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                  {t("landing.closing.ctaMerchant")}{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
          </motion.div>
          <motion.p className="quiet" variants={fadeUp} initial="hidden" whileInView="show" viewport={inView}>
            {t("landing.quiet.line")}
          </motion.p>
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
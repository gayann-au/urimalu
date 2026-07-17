import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useInView, useReducedMotion } from "framer-motion";
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
// No live data anywhere, so nothing can ever look stale. Copy for this page
// lives inline in the JSX and carries no language toggle: it is English only,
// with no second language planned. Every animation collapses to a plain fade
// when the visitor prefers reduced motion.

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
const bell = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
  </svg>
);
const sent = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7Z" />
  </svg>
);
const phoneCall = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
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

// The farmer's phone at 6:47 AM. The dashed line is the price the farmer
// named. The green line is the morning's posted prices climbing past it. The
// instant they cross, the alert lands, and the kicker makes the point: all of
// this happened before the first coffee. Decorative and hidden from readers,
// with no number printed anywhere on it.
function FarmerPhone({ reduce }) {
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
          <span className="target-chip">Your price</span>
        </div>
        <motion.div className="notif" variants={notif}>
          <span className="notif-ic">{bell}</span>
          <span className="notif-body">
            <span className="notif-top">
              <b>Urimalu</b>
              <i>6:47 AM</i>
            </span>
            <span className="notif-title">Pepper crossed your price</span>
            <span className="notif-text">A verified merchant is posting above your price. Open to see it and call.</span>
          </span>
        </motion.div>
      </motion.div>
      <motion.p className="after-line" variants={kicker} initial="hidden" animate={show ? "show" : "hidden"}>
        You have not even had your coffee yet.
      </motion.p>
    </div>
  );
}

// The merchant's phone at 6:40 AM. Four crops, each on its own track with a
// marker resting at a different spot, so the four positions never line up into
// a ranking. The prices fill in, then the posted pill lands: the morning's
// prices are up. Decorative and hidden from readers, no number printed on it.
function MerchantPhone({ reduce }) {
  const ref = useRef(null);
  const show = useInView(ref, { once: true, amount: 0.45 });
  // Each crop sits on an independent track, so a longer bar is not a higher
  // rank, just this merchant's own price for that crop. No shared axis.
  const crops = [
    { name: "Pepper", pos: 74 },
    { name: "Cardamom", pos: 46 },
    { name: "Arecanut", pos: 86 },
    { name: "Coffee", pos: 58 },
  ];
  const rows = {
    hidden: {},
    show: { transition: { staggerChildren: reduce ? 0 : 0.12, delayChildren: reduce ? 0 : 0.15 } },
  };
  const row = {
    hidden: { opacity: 0, y: reduce ? 0 : 10 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASE } },
  };
  const dot = {
    hidden: { opacity: 0, scale: 0.4 },
    show: { opacity: 1, scale: 1, transition: { duration: 0.3, delay: reduce ? 0 : 0.45, ease: EASE } },
  };
  const posted = {
    hidden: { opacity: 0, y: reduce ? 0 : 12, scale: reduce ? 1 : 0.96 },
    show: {
      opacity: 1, y: 0, scale: 1,
      transition: reduce
        ? { duration: 0.4, delay: 0.2 }
        : { type: "spring", stiffness: 240, damping: 20, delay: 1 },
    },
  };
  return (
    <div className="phone-stage" ref={ref} aria-hidden="true">
      <motion.div className="phone" initial="hidden" animate={show ? "show" : "hidden"}>
        <div className="phone-notch" />
        <div className="mhead">
          <span className="mhead-title">Today's prices</span>
          <span className="mhead-day">Fri, 6:40 AM</span>
        </div>
        <motion.div className="mrows" variants={rows}>
          {crops.map((c, i) => (
            <motion.div className="mrow" key={c.name} variants={row}>
              <span className="mcrop">{c.name}</span>
              <div className="mtrack">
                <motion.span
                  className="mfill"
                  style={{ transformOrigin: "left" }}
                  initial={{ scaleX: 0 }}
                  animate={show ? { scaleX: c.pos / 100 } : { scaleX: 0 }}
                  transition={{ duration: reduce ? 0 : 0.7, ease: EASE, delay: reduce ? 0 : 0.15 + i * 0.12 }}
                />
                <motion.span className="mdot" style={{ left: `${c.pos}%` }} variants={dot} />
              </div>
            </motion.div>
          ))}
        </motion.div>
        <motion.span className="mpost" variants={posted}>
          <span className="mpost-ic">{check}</span>
          Posted · 6:40 AM
        </motion.span>
      </motion.div>
    </div>
  );
}

// The signature sequence at 7:02 AM: the same feature from two sides, on the
// page's one dark stage. Four beats, two per phone. The farmer posts that the
// pepper is ready, every merchant buying pepper is alerted, a merchant calls,
// and the farmer's phone rings. The connector arrows light up for each hop,
// once out and once back, so the "either side" point is on screen. No number
// is printed anywhere. Decorative and hidden from readers.
function SignatureSequence({ reduce }) {
  const ref = useRef(null);
  const show = useInView(ref, { once: true, amount: 0.25 });
  const card = (delay) => ({
    initial: { opacity: 0, y: reduce ? 0 : 14, scale: reduce ? 1 : 0.98 },
    animate: show
      ? { opacity: 1, y: 0, scale: 1 }
      : { opacity: 0, y: reduce ? 0 : 14, scale: reduce ? 1 : 0.98 },
    transition: { duration: reduce ? 0 : 0.5, ease: EASE, delay: reduce ? 0 : delay },
  });
  const hop = (delay) => ({
    initial: { opacity: 0.15 },
    animate: show ? { opacity: reduce ? 0.85 : [0.15, 1, 0.35] } : { opacity: 0.15 },
    transition: reduce ? { duration: 0 } : { duration: 1.1, ease: EASE, delay, times: [0, 0.4, 1] },
  });
  return (
    <div className="sig-stage" ref={ref} aria-hidden="true">
      <div className="sig-col">
        <div className="phone sig-phone">
          <div className="phone-notch" />
          <div className="sig-screen">
            <div className="sig-topbar"><b>Urimalu</b><i>7:02 AM</i></div>
            <motion.div className="sig-card" {...card(0.3)}>
              <span className="sig-ic post">{sent}</span>
              <span className="sig-ct">
                <span className="sig-t">Pepper, ready to sell</span>
                <span className="sig-s">Posted to every merchant buying pepper</span>
              </span>
            </motion.div>
            <motion.div className="sig-card ring" {...card(3)}>
              <span className="sig-ic call">{phoneCall}</span>
              <span className="sig-ct">
                <span className="sig-t">Incoming call</span>
                <span className="sig-s">A merchant, about your pepper</span>
              </span>
            </motion.div>
          </div>
        </div>
        <span className="sig-label">Farmer</span>
      </div>
      <div className="sig-link">
        <motion.span className="sig-arrow to-merchant" {...hop(0.9)}>{arrow}</motion.span>
        <motion.span className="sig-arrow to-farmer" {...hop(2.6)}>{arrow}</motion.span>
      </div>
      <div className="sig-col">
        <div className="phone sig-phone">
          <div className="phone-notch" />
          <div className="sig-screen">
            <div className="sig-topbar"><b>Urimalu</b><i>7:02 AM</i></div>
            <motion.div className="sig-card" {...card(1.3)}>
              <span className="sig-ic alert">{bell}</span>
              <span className="sig-ct">
                <span className="sig-t">Pepper ready nearby</span>
                <span className="sig-s">A farmer is ready to sell</span>
              </span>
            </motion.div>
            <motion.div className="sig-card" {...card(2)}>
              <span className="sig-ic call">{phoneCall}</span>
              <span className="sig-ct">
                <span className="sig-t">Calling the farmer</span>
                <span className="sig-s">About the pepper</span>
              </span>
            </motion.div>
          </div>
        </div>
        <span className="sig-label">Merchant</span>
      </div>
    </div>
  );
}

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const reduce = useReducedMotion();

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
                Today's crop prices
              </motion.span>
              <h1>
                <motion.span className="h-line" variants={headline}>The farmer and the merchant</motion.span>
                <motion.span className="h-line fire" variants={headline}>start the morning with the same price.</motion.span>
              </h1>
              <motion.p className="hero-sub" variants={fadeUp}>
                Merchants post what they are paying for coffee, pepper, cardamom and arecanut. Farmers see every price posted that morning.
              </motion.p>
              <motion.div className="hero-actions" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  See today's prices{arrow}
                </MotionLink>
                <MotionLink className="btn btn-action" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                  Post today's price{arrow}
                </MotionLink>
              </motion.div>
              <motion.div className="hero-trust" variants={fadeUp}>
                <span className="tc">{check}</span>
                Every merchant is verified before their first price appears. Urimalu is free to use.
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Merchant's morning. Same shape as the farmer section below it: the
            cost of the morning stated plainly, how the app changes it, three
            points, one phone. Merchant first, because the merchant posts first
            at 6:40, and the farmer is alerted at 6:47. */}
        <section className="sec-pad persona-merchant">
          <div className="wrap persona-grid">
            <motion.div className="persona-copy" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>For merchants</motion.span>
              <motion.h2 className="persona-title" variants={fadeUp}>Post your price once, early, and it stays in front of them all morning.</motion.h2>
              <motion.p className="persona-cost" variants={fadeUp}>A morning you do not post is a morning the farmers growing that crop are looking at someone else's price. They call whoever they can see.</motion.p>
              <motion.p className="persona-body" variants={fadeUp}>Open the app, set your buying price for the crops you want, and it is in front of every farmer growing them for the rest of the day.</motion.p>
              <motion.ul className="pts" variants={stagger}>
                <motion.li variants={fadeUp}><span className="mk mk-c">{check}</span>One post reaches every farmer growing that crop.</motion.li>
                <motion.li variants={fadeUp}><span className="mk mk-c">{check}</span>Get an alert when a farmer posts that they are ready to sell.</motion.li>
                <motion.li variants={fadeUp}><span className="mk mk-c">{check}</span>Farmers call you from the app, straight to your phone.</motion.li>
              </motion.ul>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                  Sign up as a merchant{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
            <motion.div variants={cardIn} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
              <MerchantPhone reduce={reduce} />
            </motion.div>
          </div>
        </section>

        {/* Farmer's morning. The mirror of the merchant section above: same
            grid, same three points, same one phone at equal fidelity. */}
        <section className="sec-pad persona-farmer">
          <div className="wrap persona-grid">
            <motion.div className="persona-copy" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>For farmers</motion.span>
              <motion.h2 className="persona-title" variants={fadeUp}>Know the price before you load the jeep.</motion.h2>
              <motion.p className="persona-cost" variants={fadeUp}>Right now you find out the price after you arrive. The load is already on the jeep, so whatever price you hear at the gate is the price you take.</motion.p>
              <motion.p className="persona-body" variants={fadeUp}>Urimalu shows you every price posted this morning for your crop, before you leave home. You choose who to call.</motion.p>
              <motion.ul className="pts" variants={stagger}>
                <motion.li variants={fadeUp}><span className="mk mk-c">{check}</span>Every price posted for pepper this morning, in one list.</motion.li>
                <motion.li variants={fadeUp}><span className="mk mk-c">{check}</span>Set your own price for a crop, and get an alert when a merchant posts a higher one.</motion.li>
                <motion.li variants={fadeUp}><span className="mk mk-c">{check}</span>Call the merchant you choose, straight from the app.</motion.li>
              </motion.ul>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  Sign up as a farmer{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
            <motion.div variants={cardIn} initial="hidden" whileInView="show" viewport={{ once: true, amount: 0.25 }}>
              <FarmerPhone reduce={reduce} />
            </motion.div>
          </div>
        </section>

        {/* Signature sequence, the page's one dark stage and one bold moment:
            the same feature from two sides. Farmer posts, a merchant is
            alerted, the merchant calls, the farmer's phone rings. */}
        <section className="signature">
          <div className="wrap">
            <motion.div className="sig-head" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow on-ink" variants={fadeUp}>
                <ChilliMark className="dot" />
                Both sides
              </motion.span>
              <motion.h2 variants={fadeUp}>The farmer can start it too.</motion.h2>
              <motion.p className="sig-body" variants={fadeUp}>Merchants post prices in the morning. But a farmer can post as well. Say the pepper is ready, and every merchant buying pepper hears about it. The call can start from either side.</motion.p>
            </motion.div>
            <SignatureSequence reduce={reduce} />
          </div>
        </section>

        {/* Closing. The ask, then the quiet fact underneath it. */}
        <section className="wrap closing">
          <motion.div className="cta" variants={cardIn} initial="hidden" whileInView="show" viewport={inView}>
            <motion.div className="cta-in" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow on-ink" variants={fadeUp}>
                <ChilliMark className="dot" />
                Start now
              </motion.span>
              <motion.h2 variants={fadeUp}>Tomorrow morning, both of you start with the price.</motion.h2>
              <motion.p variants={fadeUp}>Whichever side of the deal you are on, the price is the same and you can see it before the day starts. Urimalu is free to use.</motion.p>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>
                  Sign up as a farmer{arrow}
                </MotionLink>
                <MotionLink className="btn btn-action" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>
                  Sign up as a merchant{arrow}
                </MotionLink>
              </motion.div>
            </motion.div>
          </motion.div>
          <motion.p className="quiet" variants={fadeUp} initial="hidden" whileInView="show" viewport={inView}>
            Urimalu grows around the people who use it. Farmers send in ideas from inside the app, and the best ones get built.
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
            <p className="ft-tag">Daily crop prices, shared between farmers and merchants.</p>
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
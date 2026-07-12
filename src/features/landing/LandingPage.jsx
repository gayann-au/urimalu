import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { supabase, isSupabaseConfigured } from "../../lib/supabase";
import { formatINR, dayKey } from "../../lib/constants";
import "./LandingPage.css";

// Urimalu marketing landing page, recreated from the Claude Design handoff.
// Static marketing content only. All colours and type are the design tokens,
// scoped under .uri-landing so they never touch the rest of the app. Internal
// links use react-router so navigation stays a single page transition.
// The hero rate card is illustrative and uses sample numbers, not live data.
//
// Motion is handled with framer-motion: hero content plays a staggered load
// reveal, every other block fades and rises into view on scroll, and buttons
// and cards lift on hover with spring physics. All of it collapses to a plain
// fade (or nothing) when the visitor prefers reduced motion.

// Links rendered as motion components so buttons can lift and press.
const MotionLink = motion.create(Link);

// Shared easing, matches the --ease-out token used across the stylesheet.
const EASE = [0.22, 0.61, 0.36, 1];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [liveRate, setLiveRate] = useState(null);
  const reduce = useReducedMotion();

  // Sticky header gains a hairline border once the page is scrolled past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Live hero rate. The landing is otherwise static, so this is the only
  // Supabase call here and it is guarded by isSupabaseConfigured. It reads the
  // most recently confirmed active listing for the crop name and price, then
  // the same crop's price_history for the day-over-day change. Any failure or
  // missing data leaves the illustrative placeholder values untouched.
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    (async () => {
      try {
        const { data: listings, error } = await supabase
          .from("listings")
          .select("crop_name, price, unit_label, price_per_kg, call_for_price, merchant_id, confirmed_at")
          .eq("is_active", true)
          .order("confirmed_at", { ascending: false, nullsFirst: false })
          .limit(1);
        if (error) throw error;
        const l = listings && listings[0];
        if (!l) return;

        const hero = l.price != null ? Number(l.price)
          : l.price_per_kg != null ? Number(l.price_per_kg)
          : null;
        if (hero == null || Number.isNaN(hero)) return;
        const unit = l.price != null && l.unit_label ? l.unit_label : "kg";

        // Day-over-day change from the same crop and merchant's price history.
        let deltaPct = null;
        const { data: hist } = await supabase
          .from("price_history")
          .select("price_per_kg, recorded_at")
          .eq("merchant_id", l.merchant_id)
          .eq("crop_name", l.crop_name)
          .order("recorded_at", { ascending: false })
          .limit(20);
        if (hist && hist.length) {
          const perDay = [];
          const seen = new Set();
          for (const r of hist) {
            if (r.price_per_kg == null) continue;
            const d = dayKey(r.recorded_at);
            if (seen.has(d)) continue;
            seen.add(d);
            perDay.push(Number(r.price_per_kg));
            if (perDay.length >= 2) break;
          }
          if (perDay.length >= 2 && perDay[1] > 0) {
            deltaPct = ((perDay[0] - perDay[1]) / perDay[1]) * 100;
          }
        }

        if (active) setLiveRate({ cropName: l.crop_name, hero, unit, deltaPct });
      } catch {
        // Keep the placeholder on any error.
      }
    })();
    return () => { active = false; };
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
  const slideInRight = {
    hidden: { opacity: 0, x: reduce ? 0 : 48, scale: reduce ? 1 : 0.97 },
    show: {
      opacity: 1,
      x: 0,
      scale: 1,
      transition: { duration: 0.75, ease: EASE, delay: reduce ? 0 : 0.12 },
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

  // Slow idle drift for the hero card, layered under its entrance animation.
  const idleFloat = reduce
    ? undefined
    : { y: [0, -8, 0], transition: { duration: 6, ease: "easeInOut", repeat: Infinity } };

  // Viewport config so each block animates once, when comfortably in view.
  const inView = { once: true, amount: 0.2 };

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
        {/* Hero */}
        <section className="hero">
          <div className="wrap hero-grid">
            <motion.div className="hero-copy" variants={stagger} initial="hidden" animate="show">
              <motion.span className="eyebrow pill" variants={fadeUp}>
                <svg className="dot" viewBox="0 0 40 48" fill="none" aria-hidden="true">
                  <path d="M26.8 12.5c1-3 .2-5.6-2.4-6.9" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
                  <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
                </svg>
                Daily crop prices
              </motion.span>
              <motion.h1 variants={fadeUp}>Real crop prices,<br /><span className="fire">with bite.</span></motion.h1>
              <motion.p className="hero-sub" variants={fadeUp}>Urimalu puts farmers and merchants on the same daily rates. Small platform, fierce honesty. Know the real price before you deal.</motion.p>
              <motion.div className="hero-trust" variants={fadeUp}>
                <span className="tc">{check}</span>
                Free to join. Every merchant verified before they post.
              </motion.div>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>Sign up as a Farmer{arrow}</MotionLink>
                <MotionLink className="btn btn-ink" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>Sign up as a Merchant{arrow}</MotionLink>
              </motion.div>
            </motion.div>

            {/* Hero visual, illustrative live rate card */}
            <motion.div className="hero-visual" aria-hidden="true" variants={slideInRight} initial="hidden" animate="show">
              <motion.div className="hero-visual-float" animate={idleFloat}>
                <div className="pulse-card">
                  <div className="pulse-head">
                    <span className="pulse-label">Today's rate</span>
                    <span className="pulse-live"><i></i>Live</span>
                  </div>
                  <div className="pulse-crop">
                    <span className="bean">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <ellipse cx="12" cy="12" rx="6.5" ry="9" /><path d="M12 3.5c-2.4 3-2.4 14 0 17" />
                      </svg>
                    </span>
                    {liveRate ? liveRate.cropName : "Robusta Cherry, per 50kg bag"}
                  </div>
                  <div className="pulse-price">{liveRate ? formatINR(liveRate.hero) : "₹9,840"} <span className="unit">{liveRate ? `/${liveRate.unit}` : "/bag"}</span></div>
                  {(!liveRate || liveRate.deltaPct != null) && (
                    <span className="pulse-delta">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M7 17 17 7" /><path d="M9 7h8v8" />
                      </svg>
                      {liveRate ? `${liveRate.deltaPct >= 0 ? "+" : ""}${liveRate.deltaPct.toFixed(1)}% vs yesterday` : "4.2% vs yesterday"}
                    </span>
                  )}
                  <svg className="pulse-svg" viewBox="0 0 380 92" fill="none" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stopColor="#2F9B58" stopOpacity=".18" /><stop offset="1" stopColor="#2F9B58" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M4 72 L56 64 L106 74 L156 50 L206 58 L256 36 L306 42 L376 14 L376 92 L4 92 Z" fill="url(#pg)" />
                    <path className="pulse-path" d="M4 72 L56 64 L106 74 L156 50 L206 58 L256 36 L306 42 L376 14" stroke="#1F7D44" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                    <circle className="pulse-glow" cx="376" cy="14" r="6" fill="#2F9B58" opacity=".35" />
                    <circle className="pulse-dot" cx="376" cy="14" r="5" fill="#1F7D44" stroke="#fff" strokeWidth="2" />
                  </svg>
                  <div className="pulse-foot">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 9-9" /><polyline points="3 4 3 9 8 9" />
                    </svg>
                    Refreshes daily. Yesterday's price is yesterday's news.
                  </div>
                </div>
                <div className="float-chip">
                  <span className="vic">{check}</span>
                  <span>Verified merchant<small>Checked before posting</small></span>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* How it works */}
        <section className="sec-pad" style={{ background: "var(--paper-2)" }}>
          <div className="wrap">
            <motion.div className="sec-head" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>How it works</motion.span>
              <motion.h2 variants={fadeUp}>Four steps. No middle layer.</motion.h2>
            </motion.div>
            <motion.div className="steps" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.div className="step" variants={fadeUp} whileHover={cardHover}>
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.5 3.5h6.7a2 2 0 0 1 1.4.6l5.3 5.3a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0l-5.3-5.3a2 2 0 0 1-.6-1.4V5.5a2 2 0 0 1 2-2Z" /><circle cx="10" cy="8" r="1.4" />
                  </svg>
                </div>
                <div className="step-n">STEP 01</div><div className="step-t">Merchants post their daily crop prices.</div>
              </motion.div>
              <motion.div className="step" variants={fadeUp} whileHover={cardHover}>
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="18" y1="20" x2="18" y2="4" />
                  </svg>
                </div>
                <div className="step-n">STEP 02</div><div className="step-t">Farmers see and compare the real rates.</div>
              </motion.div>
              <motion.div className="step" variants={fadeUp} whileHover={cardHover}>
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 18l1 3a2 2 0 0 1-2 2 16 16 0 0 1-16-16 2 2 0 0 1 2-2Z" />
                  </svg>
                </div>
                <div className="step-n">STEP 03</div><div className="step-t">They contact each other directly. No commission.</div>
              </motion.div>
              <motion.div className="step" variants={fadeUp} whileHover={cardHover}>
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
                  </svg>
                </div>
                <div className="step-n">STEP 04</div><div className="step-t">Prices update daily, so every deal is current.</div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* For farmers and merchants */}
        <section className="sec-pad">
          <div className="wrap">
            <motion.div className="sec-head" style={{ marginBottom: "46px" }} variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow" variants={fadeUp}>Built for both sides</motion.span>
              <motion.h2 variants={fadeUp}>One price. Two clear wins.</motion.h2>
            </motion.div>
            <motion.div className="split" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              {/* Farmers */}
              <motion.div className="panel panel-farmer" variants={popIn} whileHover={cardHover}>
                <svg className="panel-chilli-bg" viewBox="0 0 40 48" fill="none" aria-hidden="true">
                  <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
                </svg>
                <span className="panel-tag">
                  <span className="pic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z" />
                    </svg>
                  </span>For farmers
                </span>
                <h3>Know the real price before you sell.</h3>
                <p className="lede">No more guessing at the gate. See what merchants are actually paying today, then deal from a place of strength.</p>
                <ul>
                  <li><span className="chk">{check}</span>Compare today's rates across merchants</li>
                  <li><span className="chk">{check}</span>Contact merchants directly, no middleman</li>
                  <li><span className="chk">{check}</span>Free, forever, on any phone</li>
                </ul>
                <div className="panel-foot">
                  <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>Sign up as a Farmer{arrow}</MotionLink>
                </div>
              </motion.div>
              {/* Merchants */}
              <motion.div className="panel panel-merchant" variants={popIn} whileHover={cardHover}>
                <svg className="panel-chilli-bg" viewBox="0 0 40 48" fill="none" aria-hidden="true">
                  <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
                </svg>
                <span className="panel-tag">
                  <span className="pic">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 9 5 4h14l2 5" /><path d="M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z" /><path d="M9 9v3a3 3 0 0 0 6 0V9" />
                    </svg>
                  </span>For merchants
                </span>
                <h3>Reach more farmers. Show your daily rates.</h3>
                <p className="lede">Post once each morning and put your prices in front of farmers looking to sell right now.</p>
                <ul>
                  <li><span className="chk">{check}</span>Publish your rates in under a minute</li>
                  <li><span className="chk">{check}</span>Get found by serious, ready farmers</li>
                  <li><span className="chk">{check}</span>A verified badge that builds trust</li>
                </ul>
                <div className="panel-foot">
                  <MotionLink className="btn btn-light" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>Sign up as a Merchant{arrow}</MotionLink>
                </div>
              </motion.div>
            </motion.div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="wrap" style={{ paddingBottom: "clamp(64px,9vw,112px)" }}>
          <motion.div className="cta" variants={popIn} initial="hidden" whileInView="show" viewport={inView}>
            <motion.div className="cta-in" variants={stagger} initial="hidden" whileInView="show" viewport={inView}>
              <motion.span className="eyebrow on-ink" variants={fadeUp}>
                <svg className="dot" viewBox="0 0 40 48" fill="none" aria-hidden="true">
                  <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
                </svg>
                Small platform, big honesty
              </motion.span>
              <motion.h2 variants={fadeUp}>Today's price is waiting. Go and take it.</motion.h2>
              <motion.p variants={fadeUp}>Join Urimalu free and deal on real daily rates from your first morning.</motion.p>
              <motion.div className="btn-row" variants={fadeUp}>
                <MotionLink className="btn btn-action" to="/signup/farmer" whileHover={btnHover} whileTap={btnTap}>Sign up as a Farmer{arrow}</MotionLink>
                <MotionLink className="btn btn-outline-light" to="/signup/merchant" whileHover={btnHover} whileTap={btnTap}>Sign up as a Merchant{arrow}</MotionLink>
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

import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./LandingPage.css";

// Urimalu marketing landing page, recreated from the Claude Design handoff.
// Static marketing content only. All colours and type are the design tokens,
// scoped under .uri-landing so they never touch the rest of the app. Internal
// links use react-router so navigation stays a single page transition.
// The hero rate card is illustrative and uses sample numbers, not live data.
export default function LandingPage() {
  const rootRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);

  // Sticky header gains a hairline border once the page is scrolled past the top.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reveal on scroll. Mirrors the design prototype: fade and rise each .reveal
  // element as it enters view, with a small stagger per sibling. Respects
  // reduced motion by showing everything immediately.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = Array.from(root.querySelectorAll(".reveal"));
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const show = (el) => {
      const sibs = Array.from(el.parentNode.querySelectorAll(".reveal"));
      const i = Math.min(Math.max(sibs.indexOf(el), 0), 5);
      el.style.transitionDelay = i * 70 + "ms";
      el.classList.add("in");
    };
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    els.forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) show(el);
    });
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => {
          if (en.isIntersecting) {
            show(en.target);
            io.unobserve(en.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
    );
    els.forEach((el) => {
      if (!el.classList.contains("in")) io.observe(el);
    });
    const fallback = setTimeout(() => {
      els.forEach((el) => el.classList.add("in"));
    }, 2400);
    return () => {
      io.disconnect();
      clearTimeout(fallback);
    };
  }, []);

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
    <div className="uri-landing" ref={rootRef}>
      {/* Header */}
      <header className={`hdr${scrolled ? " scrolled" : ""}`}>
        <div className="wrap hdr-in">
          <Link className="brand" to="/" aria-label="Urimalu home">
            <svg className="mark" viewBox="0 0 40 48" fill="none" aria-hidden="true">
              <path d="M26.8 12.5c1-3 .2-5.6-2.4-6.9" stroke="var(--crop-600)" strokeWidth="3.6" strokeLinecap="round" />
              <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="var(--chilli-600)" />
              <path d="M14.5 22c1.6 4 4.2 6.4 8 7.2" stroke="var(--chilli-200)" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
            </svg>
            <span className="brand-name">Urimalu</span>
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
      </header>

      <main>
        {/* Hero */}
        <section className="hero">
          <div className="wrap hero-grid">
            <div className="hero-copy">
              <span className="eyebrow pill reveal">
                <svg className="dot" viewBox="0 0 40 48" fill="none" aria-hidden="true">
                  <path d="M26.8 12.5c1-3 .2-5.6-2.4-6.9" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" />
                  <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
                </svg>
                Daily crop prices
              </span>
              <h1 className="reveal">Real crop prices,<br /><span className="fire">with bite.</span></h1>
              <p className="hero-sub reveal">Urimalu puts farmers and merchants on the same daily rates. Small platform, fierce honesty. Know the real price before you deal.</p>
              <div className="hero-trust reveal">
                <span className="tc">{check}</span>
                Free to join. Every merchant verified before they post.
              </div>
              <div className="btn-row reveal">
                <Link className="btn btn-action" to="/signup/farmer">Sign up as a Farmer{arrow}</Link>
                <Link className="btn btn-ink" to="/signup/merchant">Sign up as a Merchant{arrow}</Link>
              </div>
            </div>

            {/* Hero visual, illustrative live rate card */}
            <div className="hero-visual reveal" aria-hidden="true">
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
                  Robusta Cherry, per 50kg bag
                </div>
                <div className="pulse-price">&#8377;9,840 <span className="unit">/bag</span></div>
                <span className="pulse-delta">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17 17 7" /><path d="M9 7h8v8" />
                  </svg>
                  4.2% vs yesterday
                </span>
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
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="sec-pad" style={{ background: "var(--paper-2)" }}>
          <div className="wrap">
            <div className="sec-head">
              <span className="eyebrow reveal">How it works</span>
              <h2 className="reveal">Four steps. No middle layer.</h2>
            </div>
            <div className="steps">
              <div className="step reveal">
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7.5 3.5h6.7a2 2 0 0 1 1.4.6l5.3 5.3a2 2 0 0 1 0 2.8l-6.5 6.5a2 2 0 0 1-2.8 0l-5.3-5.3a2 2 0 0 1-.6-1.4V5.5a2 2 0 0 1 2-2Z" /><circle cx="10" cy="8" r="1.4" />
                  </svg>
                </div>
                <div className="step-n">STEP 01</div><div className="step-t">Merchants post their daily crop prices.</div>
              </div>
              <div className="step reveal">
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="6" y1="20" x2="6" y2="13" /><line x1="12" y1="20" x2="12" y2="8" /><line x1="18" y1="20" x2="18" y2="4" />
                  </svg>
                </div>
                <div className="step-n">STEP 02</div><div className="step-t">Farmers see and compare the real rates.</div>
              </div>
              <div className="step reveal">
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 4h3l2 5-2.5 1.5a11 11 0 0 0 5 5L19 18l1 3a2 2 0 0 1-2 2 16 16 0 0 1-16-16 2 2 0 0 1 2-2Z" />
                  </svg>
                </div>
                <div className="step-n">STEP 03</div><div className="step-t">They contact each other directly. No commission.</div>
              </div>
              <div className="step reveal">
                <div className="step-ic">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" />
                  </svg>
                </div>
                <div className="step-n">STEP 04</div><div className="step-t">Prices update daily, so every deal is current.</div>
              </div>
            </div>
          </div>
        </section>

        {/* For farmers and merchants */}
        <section className="sec-pad">
          <div className="wrap">
            <div className="sec-head" style={{ marginBottom: "46px" }}>
              <span className="eyebrow reveal">Built for both sides</span>
              <h2 className="reveal">One price. Two clear wins.</h2>
            </div>
            <div className="split">
              {/* Farmers */}
              <div className="panel panel-farmer reveal">
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
                  <Link className="btn btn-action" to="/signup/farmer">Sign up as a Farmer{arrow}</Link>
                </div>
              </div>
              {/* Merchants */}
              <div className="panel panel-merchant reveal">
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
                  <Link className="btn btn-light" to="/signup/merchant">Sign up as a Merchant{arrow}</Link>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="wrap" style={{ paddingBottom: "clamp(64px,9vw,112px)" }}>
          <div className="cta reveal">
            <div className="cta-in">
              <span className="eyebrow on-ink">
                <svg className="dot" viewBox="0 0 40 48" fill="none" aria-hidden="true">
                  <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="currentColor" />
                </svg>
                Small platform, big honesty
              </span>
              <h2>Today's price is waiting. Go and take it.</h2>
              <p>Join Urimalu free and deal on real daily rates from your first morning.</p>
              <div className="btn-row">
                <Link className="btn btn-action" to="/signup/farmer">Sign up as a Farmer{arrow}</Link>
                <Link className="btn btn-outline-light" to="/signup/merchant">Sign up as a Merchant{arrow}</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="ft">
        <div className="wrap ft-in">
          <div>
            <div className="ft-brand">
              <svg className="mark" viewBox="0 0 40 48" fill="none" aria-hidden="true">
                <path d="M26.8 12.5c1-3 .2-5.6-2.4-6.9" stroke="var(--crop-600)" strokeWidth="3.6" strokeLinecap="round" />
                <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="var(--chilli-600)" />
              </svg>
              <span className="ft-name">Urimalu</span>
            </div>
            <p className="ft-tag">Real daily crop prices, shared between the people who grow and the people who buy.</p>
          </div>
          <div className="ft-links">
            <Link to="/signup/farmer">Farmers</Link>
            <Link to="/signup/merchant">Merchants</Link>
            <Link to="/login">Log in</Link>
          </div>
        </div>
        <div className="wrap">
          <div className="ft-bottom">
            <span>&copy; 2026 Urimalu. Small but fiery.</span>
            <span>Made for farmers and merchants.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

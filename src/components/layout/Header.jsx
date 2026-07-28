import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useUiStore } from "../../hooks/useUiStore";
import { useAuth, useLogout } from "../../features/auth/useAuth";
import { useUnreadNotificationCount } from "../../features/alerts/useNotifications";
import { BackIcon } from "../icons/Sprite";
import { Badge } from "../ui/Badge";
import { URI_EASE } from "../../lib/uiMotion";

// Shared app header, restyled to match the landing page .hdr: a warm cream,
// blurred, minimal bar with the logo on the left and actions on the right, and
// a hairline bottom border that only appears once the page is scrolled. No more
// green bar. Colours and behaviour mirror LandingPage.css exactly: background
// rgba(251,249,247,0.78), 14px backdrop blur, ink text, crop accents on hover.
//
// Above the md breakpoint the right side is: assistant pill, language toggle,
// role action link, bell, account, logout/login, all inline. Below md, a
// signed-in visitor sees the assistant pill, the bell and a hamburger; every
// other action (nav links, language, profile, logout) moves into a slide-in
// drawer so the bar never crowds on a phone. A logged-out visitor already has
// just two items on mobile (language toggle, login), so that row is left as is.

// Quiet text action, the same treatment as the landing header login link.
const NAV_LINK =
  "rounded-[11px] px-2 sm:px-3 min-h-[44px] text-sm font-semibold text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 shrink-0";

// Full-width row link used inside the drawer's nav list and its profile link.
const DRAWER_LINK =
  "rounded-[11px] px-3 min-h-[48px] text-base font-semibold text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center";

function BellIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

function AccountIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
      <circle cx="12" cy="7" r="4"/>
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 7h16"/>
      <path d="M4 12h16"/>
      <path d="M4 17h16"/>
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M18 6 6 18"/>
      <path d="M6 6l12 12"/>
    </svg>
  );
}

// A large four point sparkle with a small one trailing it, the usual shorthand
// for "this is the AI thing". Sized 16 rather than the 18 the other header
// icons use, because this one sits inside a pill next to a text label instead
// of alone in a 44px circle.
function SparkleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M11 3l2.1 5.9L19 11l-5.9 2.1L11 19l-2.1-5.9L3 11l5.9-2.1L11 3z"/>
      <path d="M18.5 15.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z"/>
    </svg>
  );
}

// Persisted gates for the shine sweep. This header is rendered by each page
// rather than by the app shell, so every route change builds a fresh Header
// and a fresh pill. Left ungated the sweep would replay on every navigation,
// forever, which reads as a nag rather than as a one time hint.
const SHINE_COUNT_KEY = "urimalu.assistantShineCount";
const SHINE_SHOWN_KEY = "urimalu.assistantShineShown";
const SHINE_MAX_SESSIONS = 3;

// Decide whether the shine may play now, and claim it in the same breath so
// two callers can never both win. Returns true at most once per browser
// session, and only for the first SHINE_MAX_SESSIONS sessions ever.
//
// Every read and write is wrapped the way src/i18n/index.js wraps its
// localStorage access: storage throws in private browsing and when cookies are
// blocked, and a decoration is never worth an exception, so any failure at any
// point means no shine at all. A missing or corrupt count reads as 0.
function claimShine() {
  try {
    if (sessionStorage.getItem(SHINE_SHOWN_KEY)) return false;
    const played = Number(localStorage.getItem(SHINE_COUNT_KEY)) || 0;
    if (played >= SHINE_MAX_SESSIONS) return false;
    sessionStorage.setItem(SHINE_SHOWN_KEY, "1");
    localStorage.setItem(SHINE_COUNT_KEY, String(played + 1));
    return true;
  } catch {
    return false;
  }
}

// Assistant launcher. The entry point for the whole assistant now lives here,
// in the shared header, so it sits in the same place on every page instead of
// floating over the bottom right corner.
//
// The label is the only thing that differs between desktop and mobile, so the
// caller passes it: "Urimalu AI" where there is room, "Ask AI" on a phone,
// where the pill shares the bar with the bell and the hamburger and has to fit
// a 360px screen.
//
// Deliberately not routed through i18next. The assistant is English only for
// now (see the note at the top of AssistantWidget.jsx), so its entry point is
// fixed to English too rather than half translated.
//
// The shine is a single band of light swept across the pill twice, then never
// again: repeat: 1 means one repeat after the first run, so it stops on its
// own with no timer to clean up. Whether it runs at all is decided by the
// caller, once, and passed in: see the shine claim in Header below.
function AssistantButton({ label, onClick, shine }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Open Urimalu AI assistant"
      className="relative overflow-hidden rounded-full min-h-[44px] px-3.5 bg-gradient-to-r from-chilli-600 to-ember-500 text-white font-bold text-sm inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
    >
      <SparkleIcon/>
      <span>{label}</span>
      {shine && (
        <motion.span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent"
          initial={{ x: "-150%" }}
          animate={{ x: "400%" }}
          transition={{ duration: 1.1, ease: URI_EASE, delay: 0.5, repeat: 1, repeatDelay: 1.2 }}
        />
      )}
    </button>
  );
}

// Notification bell with unread badge. Identical markup wherever it is used,
// so desktop and mobile always render the same bell.
function BellButton({ unreadCount, label }) {
  return (
    <Link to="/notifications" aria-label={label}
      className="relative rounded-full h-11 w-11 text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center shrink-0">
      <BellIcon/>
      {unreadCount > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-chilli-600 text-white text-[10px] font-bold leading-none inline-flex items-center justify-center">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </Link>
  );
}

// EN/KN toggle chip, identical markup wherever it appears (desktop bar,
// mobile guest bar, drawer).
function LangToggleButton({ lang, onToggle }) {
  return (
    <button onClick={onToggle}
      className="rounded-[11px] px-2 sm:px-3 min-h-[44px] text-xs font-bold tracking-wide text-ink-700 border border-ink-200 hover:text-crop-700 hover:border-crop-300 hover:bg-crop-50 transition-colors inline-flex items-center shrink-0"
      aria-label="Toggle language">
      {lang === "kn" ? "ಕ·EN" : "EN·ಕ"}
    </button>
  );
}

function DrawerDivider() {
  return <div className="border-t border-ink-100 mx-5 my-3" aria-hidden="true"/>;
}

// Role-appropriate nav links for the mobile drawer. Dashboard and Seller
// Leads both land on /merchant/dashboard: Seller Leads is a tab inside that
// page, not a separate route.
function drawerNavLinks(profile, t) {
  if (!profile) return [];
  if (profile.role === "FARMER") {
    return [
      { to: "/feed", label: t("nav.feed") },
      { to: "/notifications", label: t("nav.priceAlerts") },
    ];
  }
  if (profile.role === "MERCHANT") {
    const dashTgt = profile.status === "APPROVED" ? "/merchant/dashboard" : "/merchant/pending";
    return [
      { to: dashTgt, label: t("nav.dashboard") },
      { to: "/merchant/history", label: t("dashboard.priceHistory") },
      { to: dashTgt, label: t("dashboard.sellerLeadsTab") },
    ];
  }
  if (profile.role === "ADMIN") {
    return [{ to: "/admin", label: t("nav.admin") }];
  }
  return [];
}

function roleLabel(role, t) {
  if (role === "FARMER") return t("account.roleFarmer");
  if (role === "MERCHANT") return t("account.roleMerchant");
  if (role === "ADMIN") return t("account.roleAdmin");
  return "";
}

// Slide-in drawer for the mobile menu. Overlay fades, panel slides from the
// right using the app's shared easing curve (URI_EASE from uiMotion.js).
// Every link and the logout button close the drawer on click, on top of
// whatever navigation or action they trigger.
function MobileDrawer({ open, onClose, profile, lang, onToggleLang, onLogout, t }) {
  const displayName = profile?.business_name || profile?.full_name || profile?.email || "";
  const links = drawerNavLinks(profile, t);

  // Portalled to document.body. The header carries backdrop-blur (a
  // backdrop-filter), which establishes a new containing block for any
  // position:fixed descendant. Left in place, the overlay and this panel
  // would size and position themselves against the header's own small box
  // instead of the viewport, clipping everything below the close button.
  // Rendering outside the header sidesteps that entirely.
  return createPortal(
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="drawer-overlay"
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            onClick={onClose}
          />
          <motion.aside
            key="drawer-panel"
            role="dialog"
            aria-modal="true"
            className="fixed top-0 right-0 z-50 h-full w-[82%] max-w-[340px] bg-white shadow-xl flex flex-col overflow-y-auto"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ duration: 0.35, ease: URI_EASE }}
          >
            <div className="flex items-center justify-end p-3">
              <button onClick={onClose} aria-label={t("nav.closeMenu")}
                className="h-11 w-11 rounded-full text-ink-700 hover:text-crop-700 hover:bg-crop-50 inline-flex items-center justify-center transition-colors">
                <CloseIcon/>
              </button>
            </div>

            {profile && (
              <>
                <div className="px-5 pb-1">
                  <div className="font-display font-extrabold text-lg text-ink-900 truncate">
                    {displayName}
                  </div>
                  <div className="mt-1.5">
                    <Badge tone="coorg">{roleLabel(profile.role, t)}</Badge>
                  </div>
                </div>

                <DrawerDivider/>

                <nav className="px-2 flex flex-col">
                  {links.map((l, i) => (
                    <Link key={`${l.to}-${i}`} to={l.to} onClick={onClose} className={DRAWER_LINK}>
                      {l.label}
                    </Link>
                  ))}
                </nav>

                <DrawerDivider/>
              </>
            )}

            <div className="px-5">
              <LangToggleButton lang={lang} onToggle={onToggleLang}/>
            </div>

            {profile && (
              <>
                <DrawerDivider/>

                <div className="px-2 flex flex-col">
                  <Link to="/account" onClick={onClose} className={DRAWER_LINK}>
                    {t("nav.account")}
                  </Link>
                </div>

                <div className="px-3 pt-2 pb-4">
                  <button
                    onClick={onLogout}
                    className="w-full rounded-[14px] bg-chilli-600 text-white font-bold text-sm min-h-[48px] hover:bg-chilli-700 transition-colors"
                  >
                    {t("nav.logout")}
                  </button>
                </div>
              </>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}

// Logo image with a graceful fallback. The asset ships at the requested path
// (/icons/logo-urimalu.png) and loads fine on a clean load, so this guards the
// stale-shell case: a browser still running a cached app shell from before the
// deploy that introduced the brand assets can fail this fetch and would
// otherwise show the browser's broken-image glyph next to the wordmark. On any
// load error we swap to the "Urimalu" text wordmark instead.
function LogoMark() {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <span
        className="font-display font-extrabold text-lg tracking-tight text-chilli-700"
        style={{ lineHeight: "36px" }}
      >
        Urimalu
      </span>
    );
  }
  return (
    <img
      src="/icons/logo-urimalu.png"
      alt="Urimalu"
      style={{ height: "36px", width: "auto" }}
      onError={() => setBroken(true)}
    />
  );
}

export function Header({ showBack = false, title }) {
  const { t } = useTranslation();
  const lang = useUiStore(s => s.lang);
  const toggleLang = useUiStore(s => s.toggleLang);
  const openAssistant = useUiStore(s => s.openAssistant);
  const reduceMotion = useReducedMotion();
  const [shine, setShine] = useState(false);
  const shineClaimed = useRef(false);
  const { profile } = useAuth();
  const logout = useLogout();
  const nav = useNavigate();
  const unreadCount = useUnreadNotificationCount();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Hairline bottom border appears once the page is scrolled past the top,
  // exactly like the landing header.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  function closeDrawer() { setDrawerOpen(false); }
  function handleLogout() {
    closeDrawer();
    logout.mutate();
  }

  // Same test AssistantWidget applies to itself, so the button and the panel
  // can never disagree about who gets the assistant. Admins are excluded, and
  // so is anyone without a profile row yet: /onboarding renders this header
  // before the visitor has picked a role, and there is nothing to assist with
  // until they have.
  const assistantEligible = !!profile && (profile.role === "FARMER" || profile.role === "MERCHANT");

  // The claim waits for eligibility instead of running on mount, because this
  // header is rendered by plenty of pages that never show the pill: login, both
  // signup forms, onboarding, the two password screens, the 404 and the admin
  // console. Claimed on mount, someone signing in would spend the shine on the
  // login page, where there is no pill to sweep, and reach the feed with it
  // already used up. Three logins would exhaust all three sessions without the
  // sweep ever being seen once.
  //
  // The ref holds it to one claim per Header mount, so the re-render that
  // arrives with the profile cannot claim a second time. Both pills are handed
  // the one result: both sit in the tree at all times, one hidden by a
  // breakpoint rather than unmounted, so claiming per pill would let the hidden
  // desktop one swallow the shine and leave the visible mobile one flat.
  // Reduced motion returns before the claim, so a visitor who wants no
  // animation does not silently burn a session on a sweep never rendered.
  useEffect(() => {
    if (shineClaimed.current) return;
    if (!assistantEligible || reduceMotion) return;
    shineClaimed.current = true;
    setShine(claimShine());
  }, [assistantEligible, reduceMotion]);

  let actionLink = null;
  if (profile) {
    if (profile.role === "ADMIN") {
      actionLink = <Link to="/admin" className={NAV_LINK}>{t("nav.admin")}</Link>;
    } else if (profile.role === "MERCHANT") {
      const tgt = profile.status === "APPROVED" ? "/merchant/dashboard" : "/merchant/pending";
      actionLink = <Link to={tgt} className={NAV_LINK}>{t("nav.dashboard")}</Link>;
    }
  }

  return (
    <header
      className={`sticky top-0 z-30 w-full bg-[rgba(251,249,247,0.78)] backdrop-blur-[14px] backdrop-saturate-[1.4] border-b transition-colors ${
        scrolled ? "border-ink-200" : "border-transparent"
      }`}
    >
      <div className="flex items-center justify-between gap-1 sm:gap-2 h-16 w-full mx-auto max-w-screen-2xl px-2 sm:px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showBack ? (
            <button onClick={() => nav(-1)} aria-label={t("common.back")}
              className="h-11 w-11 -ml-2 rounded-full text-ink-700 hover:text-crop-700 hover:bg-crop-50 active:scale-95 transition-colors inline-flex items-center justify-center shrink-0">
              <BackIcon/>
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-2.5 min-w-0 min-h-[44px]">
              <div className="leading-tight min-w-0">
                <LogoMark/>
                <div className={`text-[11px] text-ink-500 truncate ${lang === "kn" ? "kn" : ""}`}>{t("app.tagline")}</div>
              </div>
            </Link>
          )}
          {title && <h1 className="font-display font-extrabold text-lg tracking-tight text-ink-900 truncate ml-1">{title}</h1>}
        </div>

        {/* Desktop and up: every action inline, unchanged from before. */}
        <div className="hidden md:flex items-center gap-0.5 sm:gap-1 shrink-0">
          {assistantEligible && <AssistantButton label="Urimalu AI" onClick={openAssistant} shine={shine}/>}
          <LangToggleButton lang={lang} onToggle={toggleLang}/>
          {actionLink}
          {profile && <BellButton unreadCount={unreadCount} label={t("nav.notifications")}/>}
          {profile && (
            <Link to="/account" aria-label={t("nav.account")}
              className="rounded-full h-11 w-11 text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center shrink-0">
              <AccountIcon/>
            </Link>
          )}
          {profile ? (
            <button onClick={() => logout.mutate()} className={NAV_LINK}>
              {t("nav.logout")}
            </button>
          ) : (
            <Link to="/login" className="rounded-[11px] bg-coorg-600 text-white px-3 min-h-[44px] text-sm font-bold hover:bg-coorg-700 transition-colors whitespace-nowrap inline-flex items-center shrink-0">
              {t("nav.login")}
            </Link>
          )}
        </div>

        {/* Below md: signed-in visitors get the bell plus a hamburger that
            opens the drawer. A logged-out visitor already has only the
            language toggle and login, so that pair is kept as is. */}
        <div className="flex md:hidden items-center gap-0.5 shrink-0">
          {profile ? (
            <>
              {assistantEligible && <AssistantButton label="Ask AI" onClick={openAssistant} shine={shine}/>}
              <BellButton unreadCount={unreadCount} label={t("nav.notifications")}/>
              <button onClick={() => setDrawerOpen(true)} aria-label={t("nav.openMenu")}
                className="rounded-full h-11 w-11 text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center shrink-0">
                <MenuIcon/>
              </button>
            </>
          ) : (
            <>
              <LangToggleButton lang={lang} onToggle={toggleLang}/>
              <Link to="/login" className="rounded-[11px] bg-coorg-600 text-white px-3 min-h-[44px] text-sm font-bold hover:bg-coorg-700 transition-colors whitespace-nowrap inline-flex items-center shrink-0">
                {t("nav.login")}
              </Link>
            </>
          )}
        </div>
      </div>

      <MobileDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        profile={profile}
        lang={lang}
        onToggleLang={toggleLang}
        onLogout={handleLogout}
        t={t}
      />
    </header>
  );
}

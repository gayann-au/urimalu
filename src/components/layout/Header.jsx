import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../hooks/useUiStore";
import { useAuth, useLogout } from "../../features/auth/useAuth";
import { useUnreadNotificationCount } from "../../features/alerts/useNotifications";
import { BackIcon } from "../icons/Sprite";

// Shared app header, restyled to match the landing page .hdr: a warm cream,
// blurred, minimal bar with the logo on the left and actions on the right, and
// a hairline bottom border that only appears once the page is scrolled. No more
// green bar. Colours and behaviour mirror LandingPage.css exactly: background
// rgba(251,249,247,0.78), 14px backdrop blur, ink text, crop accents on hover.

// Quiet text action, the same treatment as the landing header login link.
const NAV_LINK =
  "rounded-[11px] px-2 sm:px-3 min-h-[44px] text-sm font-semibold text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors whitespace-nowrap inline-flex items-center gap-1.5 shrink-0";

export function Header({ showBack = false, title }) {
  const { t } = useTranslation();
  const lang = useUiStore(s => s.lang);
  const toggleLang = useUiStore(s => s.toggleLang);
  const { profile } = useAuth();
  const logout = useLogout();
  const nav = useNavigate();
  const unreadCount = useUnreadNotificationCount();

  // Hairline bottom border appears once the page is scrolled past the top,
  // exactly like the landing header.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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
                <img src="/icons/logo-urimalu.png" alt="Urimalu" style={{ height: "36px", width: "auto" }} />
                <div className={`text-[11px] text-ink-500 truncate ${lang === "kn" ? "kn" : ""}`}>{t("app.tagline")}</div>
              </div>
            </Link>
          )}
          {title && <h1 className="font-display font-extrabold text-lg tracking-tight text-ink-900 truncate ml-1">{title}</h1>}
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button onClick={toggleLang}
            className="rounded-[11px] px-2 sm:px-3 min-h-[44px] text-xs font-bold tracking-wide text-ink-700 border border-ink-200 hover:text-crop-700 hover:border-crop-300 hover:bg-crop-50 transition-colors inline-flex items-center shrink-0"
            aria-label="Toggle language">
            {lang === "kn" ? "ಕ·EN" : "EN·ಕ"}
          </button>
          {actionLink}
          {profile && (
            <Link to="/notifications" aria-label={t("nav.notifications")}
              className="relative rounded-full h-11 w-11 text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
              </svg>
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-chilli-600 text-white text-[10px] font-bold leading-none inline-flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
          )}
          {profile && (
            <Link to="/account" aria-label={t("nav.account")}
              className="rounded-full h-11 w-11 text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
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
      </div>
    </header>
  );
}

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../hooks/useUiStore";
import { useAuth, useLogout } from "../../features/auth/useAuth";
import { BackIcon } from "../icons/Sprite";

// Shared app header, restyled to match the landing page .hdr: a warm cream,
// blurred, minimal bar with the logo on the left and actions on the right, and
// a hairline bottom border that only appears once the page is scrolled. No more
// green bar. Colours and behaviour mirror LandingPage.css exactly: background
// rgba(251,249,247,0.78), 14px backdrop blur, ink text, crop accents on hover.

// Quiet text action, the same treatment as the landing header login link.
const NAV_LINK =
  "rounded-[11px] px-3 py-2 text-sm font-semibold text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors whitespace-nowrap inline-flex items-center gap-1.5";

// Chilli mark from the landing logo, drawn with the brand token hex values.
function BrandMark() {
  return (
    <svg width="28" height="32" viewBox="0 0 40 48" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M26.8 12.5c1-3 .2-5.6-2.4-6.9" stroke="#1F7D44" strokeWidth="3.6" strokeLinecap="round" />
      <path d="M22.5 12C12 12.6 6.5 20.5 8 30c1.2 7.6 7 13.4 12.8 12.4 4.3-.74 7.2-6.6 5.2-14.3C24.4 21.5 30 13 22.5 12Z" fill="#D6263A" />
      <path d="M14.5 22c1.6 4 4.2 6.4 8 7.2" stroke="#FFC7CB" strokeWidth="2.4" strokeLinecap="round" opacity=".7" />
    </svg>
  );
}

export function Header({ showBack = false, title }) {
  const { t } = useTranslation();
  const lang = useUiStore(s => s.lang);
  const toggleLang = useUiStore(s => s.toggleLang);
  const { profile } = useAuth();
  const logout = useLogout();
  const nav = useNavigate();

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
      <div className="flex items-center justify-between gap-2 h-16 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showBack ? (
            <button onClick={() => nav(-1)} aria-label={t("common.back")}
              className="p-2 -ml-2 rounded-full text-ink-700 hover:text-crop-700 hover:bg-crop-50 active:scale-95 transition-colors">
              <BackIcon/>
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-2.5 min-w-0">
              <BrandMark/>
              <div className="leading-tight min-w-0">
                <div className={`font-display font-extrabold text-lg tracking-tight text-ink-900 truncate ${lang === "kn" ? "kn" : ""}`}>{t("app.name")}</div>
                <div className={`text-[11px] text-ink-500 truncate ${lang === "kn" ? "kn" : ""}`}>{t("app.tagline")}</div>
              </div>
            </Link>
          )}
          {title && <h1 className="font-display font-extrabold text-lg tracking-tight text-ink-900 truncate ml-1">{title}</h1>}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button onClick={toggleLang}
            className="rounded-[11px] px-3 py-2 text-xs font-bold tracking-wide text-ink-700 border border-ink-200 hover:text-crop-700 hover:border-crop-300 hover:bg-crop-50 transition-colors"
            aria-label="Toggle language">
            {lang === "kn" ? "ಕ·EN" : "EN·ಕ"}
          </button>
          {actionLink}
          {profile && (
            <Link to="/account" aria-label={t("nav.account")}
              className="rounded-full p-2 text-ink-700 hover:text-crop-700 hover:bg-crop-50 transition-colors inline-flex items-center justify-center">
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
            <Link to="/login" className="rounded-[11px] bg-coorg-600 text-white px-3.5 py-2 text-sm font-bold hover:bg-coorg-700 transition-colors whitespace-nowrap">
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

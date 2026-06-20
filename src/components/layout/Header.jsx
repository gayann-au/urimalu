import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useUiStore } from "../../hooks/useUiStore";
import { useAuth, useLogout } from "../../features/auth/useAuth";
import { BackIcon } from "../icons/Sprite";

export function Header({ showBack = false, title }) {
  const { t } = useTranslation();
  const lang = useUiStore(s => s.lang);
  const toggleLang = useUiStore(s => s.toggleLang);
  const { profile } = useAuth();
  const logout = useLogout();
  const nav = useNavigate();

  let actionLink = null;
  if (profile) {
    if (profile.role === "ADMIN") {
      actionLink = <Link to="/admin" className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-bold">{t("nav.admin")}</Link>;
    } else if (profile.role === "MERCHANT") {
      const tgt = profile.status === "APPROVED" ? "/merchant/dashboard" : "/merchant/pending";
      actionLink = <Link to={tgt} className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-bold">{t("nav.dashboard")}</Link>;
    }
  }

  return (
    <header className="sticky top-0 z-30 bg-coorg-600 text-white shadow-md w-full">
      <div className="flex items-center justify-between py-3 gap-2 w-full mx-auto max-w-screen-2xl px-4 md:px-6 lg:px-8">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {showBack ? (
            <button onClick={() => nav(-1)} aria-label={t("common.back")}
              className="p-2 -ml-2 rounded-full hover:bg-coorg-700/40 active:scale-95">
              <BackIcon/>
            </button>
          ) : (
            <Link to="/" className="flex items-center gap-2 min-w-0">
              <div className="leading-tight min-w-0">
                <div className={`font-extrabold text-lg truncate ${lang === "kn" ? "kn" : ""}`}>{t("app.name")}</div>
                <div className={`text-[11px] text-coorg-100 truncate ${lang === "kn" ? "kn" : ""}`}>{t("app.tagline")}</div>
              </div>
            </Link>
          )}
          {title && <h1 className="font-bold text-lg truncate ml-1">{title}</h1>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button onClick={toggleLang}
            className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-bold tracking-wide ring-1 ring-white/20"
            aria-label="Toggle language">
            {lang === "kn" ? "ಕ·EN" : "EN·ಕ"}
          </button>
          {actionLink}
          {profile && (
            <Link to="/account" aria-label={t("nav.account")}
              className="rounded-full bg-white/15 hover:bg-white/25 p-2 inline-flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/>
                <circle cx="12" cy="7" r="4"/>
              </svg>
            </Link>
          )}
          {profile ? (
            <button onClick={() => logout.mutate()} className="rounded-full bg-white/15 hover:bg-white/25 px-3 py-1.5 text-xs font-bold">
              {t("nav.logout")}
            </button>
          ) : (
            <Link to="/login" className="rounded-full bg-white text-coorg-700 px-3 py-1.5 text-xs font-bold">
              {t("nav.login")}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { useAuth } from "../auth/useAuth";
import AccountFarmerForm from "./AccountFarmerForm";
import AccountMerchantForm from "./AccountMerchantForm";
import { useUriMotion } from "../../lib/uiMotion";

const ROLE_LABEL_KEY = {
  FARMER: "account.roleFarmer",
  MERCHANT: "account.roleMerchant",
  ADMIN: "account.roleAdmin",
};

// Self-service account page. Any logged-in user reaches it to view and edit
// their own profile: farmers edit name/phone/district, merchants edit their
// full business profile. The public merchant viewer at /merchant/:id is a
// separate read-only page and is not affected by this screen.
export default function AccountPage() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const { profile } = useAuth();
  if (!profile) return null; // AccountRoute guards this; defensive only.

  const isFarmer = profile.role === "FARMER";
  const isMerchant = profile.role === "MERCHANT";
  const heading = isMerchant
    ? t("account.merchantHeading")
    : isFarmer
      ? t("account.farmerHeading")
      : t("account.title");

  return (
    <div className="flex flex-col flex-1 items-center isolate">
      <GlowBackdrop/>
      <Header showBack title={t("account.title")}/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        <motion.div variants={m.stagger} initial="hidden" animate="show">
          <div className="mb-6">
            <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{heading}</motion.h2>
            <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">{t("account.sub")}</motion.p>
          </div>

          <motion.div variants={m.fadeUp} className="rounded-2xl border border-ink-200 bg-paper-2 p-4 mb-6 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-ink-500">{t("account.emailLabel")}</span>
              <span className="font-semibold text-ink-900 truncate">{profile.email || "-"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 mt-2">
              <span className="text-ink-500">{t("account.roleLabel")}</span>
              <span className="font-semibold text-ink-900">
                {t(ROLE_LABEL_KEY[profile.role] || "account.roleLabel")}
              </span>
            </div>
          </motion.div>
        </motion.div>

        {isFarmer && <AccountFarmerForm profile={profile}/>}
        {isMerchant && <AccountMerchantForm profile={profile}/>}
        {!isFarmer && !isMerchant && (
          <p className="text-sm text-ink-500">{t("account.adminNote")}</p>
        )}

        {(isFarmer || isMerchant) && (
          <motion.div variants={m.fadeUp} initial="hidden" animate="show" className="mt-6">
            <Link to="/feature-request"
              className="flex items-center justify-between rounded-2xl border border-ink-200 bg-white px-4 py-3.5 text-sm font-semibold text-ink-800 shadow-sm hover:border-coorg-300 transition-colors">
              <span>{t("feature.link")}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            </Link>
          </motion.div>
        )}
      </main>
    </div>
  );
}

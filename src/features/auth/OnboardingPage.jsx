import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { Header } from "../../components/layout/Header";
import { useAuth, useLogout } from "./useAuth";
import OnboardingFarmerForm from "./OnboardingFarmerForm";
import OnboardingMerchantForm from "./OnboardingMerchantForm";
import { useUriMotion } from "../../lib/uiMotion";

// Google onboarding screen. Reached only by a signed-in account that has no
// public.users row yet (a brand new Google sign-up). Step one asks the single
// Canva style question, Farmer or Merchant; step two collects the same profile
// the matching password sign-up collects. After that the user is fully set up
// with the correct role and lands in the app.

function RoleCard({ onClick, icon, title, desc, variants, whileHover, whileTap }) {
  return (
    <motion.button
      onClick={onClick}
      variants={variants}
      whileHover={whileHover}
      whileTap={whileTap}
      className="w-full text-left rounded-3xl bg-white border border-ink-200 shadow-sm hover:shadow-md hover:border-coorg-300 p-6 transition-colors flex items-start gap-4"
    >
      <span className="shrink-0 h-12 w-12 rounded-[14px] bg-coorg-50 text-coorg-600 flex items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-extrabold tracking-tight text-ink-900">{title}</span>
        <span className="block text-sm text-ink-500 mt-0.5">{desc}</span>
      </span>
    </motion.button>
  );
}

const farmerIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 2 4 6v6c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-4Z"/>
    <path d="m9 12 2 2 4-4"/>
  </svg>
);

const merchantIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 9 5 4h14l2 5"/>
    <path d="M4 9h16v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V9Z"/>
    <path d="M9 9v3a3 3 0 0 0 6 0V9"/>
  </svg>
);

export default function OnboardingPage() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const { user } = useAuth();
  const logout = useLogout();
  const [stage, setStage] = useState("role"); // role -> farmer | merchant

  const backToRole = () => setStage("role");

  return (
    <div className="flex flex-col flex-1 items-center">
      <Header/>
      <main className="w-full max-w-md px-5 py-8 flex-1">
        {stage === "role" && (
          <motion.div variants={m.stagger} initial="hidden" animate="show">
            <div className="text-center mb-6">
              <motion.h2 variants={m.fadeUp} className="font-display text-3xl font-extrabold tracking-tight text-chilli-700">{t("onboarding.welcomeTitle")}</motion.h2>
              <motion.p variants={m.fadeUp} className="text-sm text-ink-500 mt-1.5">{t("onboarding.welcomeSub")}</motion.p>
              {user?.email && (
                <motion.p variants={m.fadeUp} className="text-xs text-ink-500 mt-2 truncate">{user.email}</motion.p>
              )}
            </div>
            <motion.p variants={m.fadeUp} className="text-sm font-semibold text-ink-700 mb-3">{t("onboarding.whoAreYou")}</motion.p>
            <div className="space-y-3">
              <RoleCard onClick={() => setStage("farmer")} icon={farmerIcon}
                title={t("onboarding.farmerTitle")} desc={t("onboarding.farmerDesc")}
                variants={m.fadeUp} whileHover={m.cardHover} whileTap={m.btnTap}/>
              <RoleCard onClick={() => setStage("merchant")} icon={merchantIcon}
                title={t("onboarding.merchantTitle")} desc={t("onboarding.merchantDesc")}
                variants={m.fadeUp} whileHover={m.cardHover} whileTap={m.btnTap}/>
            </div>
            <motion.button variants={m.fadeUp} onClick={() => logout.mutate()}
              className="mt-8 block text-center text-sm text-ink-500 underline w-full">
              {t("onboarding.differentAccount")}
            </motion.button>
          </motion.div>
        )}

        {stage === "farmer" && <OnboardingFarmerForm onBack={backToRole}/>}
        {stage === "merchant" && <OnboardingMerchantForm onBack={backToRole}/>}
      </main>
    </div>
  );
}

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { useAuth, useLogout } from "./useAuth";
import OnboardingFarmerForm from "./OnboardingFarmerForm";
import OnboardingMerchantForm from "./OnboardingMerchantForm";

// Google onboarding screen. Reached only by a signed-in account that has no
// public.users row yet (a brand new Google sign-up). Step one asks the single
// Canva style question, Farmer or Merchant; step two collects the same profile
// the matching password sign-up collects. After that the user is fully set up
// with the correct role and lands in the app.

function RoleCard({ onClick, icon, title, desc }) {
  return (
    <button onClick={onClick}
      className="w-full text-left rounded-2xl border-2 border-coorg-200 hover:border-coorg-600 hover:bg-coorg-50 p-5 transition active:scale-[0.99] flex items-start gap-4">
      <span className="shrink-0 h-12 w-12 rounded-xl bg-coorg-100 text-coorg-700 flex items-center justify-center">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-lg font-extrabold text-gray-900">{title}</span>
        <span className="block text-sm text-gray-500 mt-0.5">{desc}</span>
      </span>
    </button>
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
  const { user } = useAuth();
  const logout = useLogout();
  const [stage, setStage] = useState("role"); // role -> farmer | merchant

  const backToRole = () => setStage("role");

  return (
    <div className="flex flex-col flex-1 items-center">
      <Header/>
      <main className="w-full max-w-md px-5 py-6 flex-1">
        {stage === "role" && (
          <>
            <div className="text-center mb-6">
              <h2 className="text-2xl font-extrabold text-chilli-700">{t("onboarding.welcomeTitle")}</h2>
              <p className="text-sm text-gray-500 mt-1">{t("onboarding.welcomeSub")}</p>
              {user?.email && (
                <p className="text-xs text-gray-400 mt-2 truncate">{user.email}</p>
              )}
            </div>
            <p className="text-sm font-semibold text-gray-700 mb-3">{t("onboarding.whoAreYou")}</p>
            <div className="space-y-3">
              <RoleCard onClick={() => setStage("farmer")} icon={farmerIcon}
                title={t("onboarding.farmerTitle")} desc={t("onboarding.farmerDesc")}/>
              <RoleCard onClick={() => setStage("merchant")} icon={merchantIcon}
                title={t("onboarding.merchantTitle")} desc={t("onboarding.merchantDesc")}/>
            </div>
            <button onClick={() => logout.mutate()}
              className="mt-8 block text-center text-sm text-gray-400 underline w-full">
              {t("onboarding.differentAccount")}
            </button>
          </>
        )}

        {stage === "farmer" && <OnboardingFarmerForm onBack={backToRole}/>}
        {stage === "merchant" && <OnboardingMerchantForm onBack={backToRole}/>}
      </main>
    </div>
  );
}

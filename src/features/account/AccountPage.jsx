import { useTranslation } from "react-i18next";
import { Header } from "../../components/layout/Header";
import { useAuth } from "../auth/useAuth";
import AccountFarmerForm from "./AccountFarmerForm";
import AccountMerchantForm from "./AccountMerchantForm";

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
    <div className="flex flex-col flex-1 items-center">
      <Header showBack title={t("account.title")}/>
      <main className="w-full max-w-md px-5 py-6 flex-1">
        <div className="mb-5">
          <h2 className="text-2xl font-extrabold text-chilli-700">{heading}</h2>
          <p className="text-sm text-gray-500 mt-1">{t("account.sub")}</p>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4 mb-6 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-gray-500">{t("account.emailLabel")}</span>
            <span className="font-semibold text-gray-900 truncate">{profile.email || "-"}</span>
          </div>
          <div className="flex items-center justify-between gap-3 mt-2">
            <span className="text-gray-500">{t("account.roleLabel")}</span>
            <span className="font-semibold text-gray-900">
              {t(ROLE_LABEL_KEY[profile.role] || "account.roleLabel")}
            </span>
          </div>
        </div>

        {isFarmer && <AccountFarmerForm profile={profile}/>}
        {isMerchant && <AccountMerchantForm profile={profile}/>}
        {!isFarmer && !isMerchant && (
          <p className="text-sm text-gray-500">{t("account.adminNote")}</p>
        )}
      </main>
    </div>
  );
}

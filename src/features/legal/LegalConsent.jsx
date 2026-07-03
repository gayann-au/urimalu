import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

// Small note shown on the login and signup screens, placed near the main action
// so it is clear that creating an account or signing in means agreeing to the
// policies. The links open the public legal pages. Fully translated: the
// sentence is built as prefix + links + suffix so Kannada, which puts the verb
// at the end, reads naturally.
const PREFIX_KEY = {
  "continuing": "auth.consentByContinuing",
  "signing up": "auth.consentBySigningUp",
  "registering": "auth.consentByRegistering",
};

export default function LegalConsent({ action = "continuing" }) {
  const { t } = useTranslation();
  return (
    <p className="mt-4 text-center text-xs text-gray-500 leading-relaxed">
      {t(PREFIX_KEY[action] || PREFIX_KEY.continuing)}{" "}
      <Link to="/terms" className="font-semibold text-coorg-700 hover:text-coorg-800">
        {t("auth.termsLink")}
      </Link>{" "}
      {t("auth.consentAnd")}{" "}
      <Link to="/privacy" className="font-semibold text-coorg-700 hover:text-coorg-800">
        {t("auth.privacyLink")}
      </Link>
      {t("auth.consentSuffix")}
    </p>
  );
}

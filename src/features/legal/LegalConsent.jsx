import { Link } from "react-router-dom";

// Small note shown on the login and signup screens, placed near the main action
// so it is clear that creating an account or signing in means agreeing to the
// policies. The links open the public legal pages.
export default function LegalConsent({ action = "continuing" }) {
  return (
    <p className="mt-4 text-center text-xs text-gray-500 leading-relaxed">
      By {action} you agree to our{" "}
      <Link to="/terms" className="font-semibold text-coorg-700 hover:text-coorg-800">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link to="/privacy" className="font-semibold text-coorg-700 hover:text-coorg-800">
        Privacy Policy
      </Link>
      .
    </p>
  );
}

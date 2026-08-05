import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useInstallPrompt } from "./InstallPromptProvider";
import { resolveInstallMessage } from "../lib/installMessage";
import { useUriMotion } from "../lib/uiMotion";

// The always-there way to put Urimalu on the home screen.
//
// WHY IT EXISTS. The bottom strip can be dismissed, and then it stays gone for
// seven days. Without this card those seven days have no way to install
// anywhere in the product, so anyone who taps the cross and changes their mind
// an hour later is stuck until the following week. This card is the answer to
// that: quiet, in the page flow, and always present on the few pages where
// someone is already looking at their own setup rather than doing a job.
//
// It is deliberately NOT dismissible. It never interrupts, never covers
// anything and never appears twice, so there is nothing to dismiss; and a
// dismiss here would rebuild the exact dead end the card exists to remove.
//
// It is inline: a normal block in the document flow. No fixed positioning, no
// backdrop, no portal. It cannot cover a button or the end of a list because it
// takes up its own space like any other card on the page.
//
// The message and whether a real button is possible both come from
// resolveInstallMessage, the same resolver the strip uses, so the two can never
// tell the same person two different stories about their own browser.
export function InstallCard({ className = "" }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const install = useInstallPrompt();

  // Already on the home screen, so there is nothing to offer. Covers the
  // standalone display mode, iOS navigator.standalone, and a remembered
  // appinstalled, all resolved by the provider.
  if (install.isInstalled) return null;

  // Desktop and anything unrecognised: out of scope, same as the strip.
  const variant = resolveInstallMessage(t, install);
  if (!variant) return null;

  return (
    <motion.section
      variants={m.fadeUp}
      initial="hidden"
      animate="show"
      className={`rounded-2xl border border-ink-200 bg-white shadow-sm px-5 py-4 text-left ${className}`}
    >
      <p className="font-display font-extrabold text-sm text-ink-900">
        {t("install.cardTitle")}
      </p>
      <p className="mt-1 text-[13px] leading-snug text-ink-600">
        {variant.message}
      </p>

      {/* Only rendered when a real, unspent prompt is held. On iOS and inside a
          webview the message above carries the steps instead, so there is never
          a button here that would do nothing when tapped. */}
      {variant.canPrompt && (
        <motion.button
          type="button"
          onClick={install.promptInstall}
          whileTap={m.btnTap}
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-[14px] bg-chilli-600 px-5 text-sm font-bold text-white transition-colors hover:bg-chilli-700"
        >
          {t("install.android.button")}
        </motion.button>
      )}
    </motion.section>
  );
}

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { useInstallPrompt } from "./InstallPromptProvider";
import { resolveInstallHow } from "../lib/installMessage";
import { useUriMotion } from "../lib/uiMotion";

// The ask at the moment it makes sense.
//
// Three moments, all of them a point where the person has just asked the app to
// reach them later and is therefore about to find out whether it can:
//   follow   a farmer turned on price alerts for a crop
//   lead     a farmer posted a Ready to Sell lead and is waiting on merchants
//   merchant a merchant was just approved and is opening the app for real
//
// WHAT THIS IS NOT. It is not a popup, an overlay, a modal, or anything with a
// backdrop. It renders as a normal block in the page flow wherever the host
// puts it, takes up its own space, and covers nothing. That is deliberate and
// not a style preference: people close cookie style blockers by reflex without
// reading them, and Chrome counts repeatedly dismissed install prompts against
// a site and can stop offering install on it at all. An ask that is easy to
// ignore keeps working; one that blocks the page gets the site punished.
//
// It appears only AFTER the action has actually succeeded. The host passes
// active once its mutation has resolved, never on the way in.

// One flag per moment, so each of the three can ask at most once on this
// device, ever.
const MOMENT_KEY_PREFIX = "urimalu_pwa_moment_";
// One flag for the whole browser session, so the three moments together can
// ask at most once before the tab is closed. A farmer who follows three crops
// and posts a lead in one sitting is asked once, not four times.
const SESSION_KEY = "urimalu_pwa_moment_session";

// Every storage read fails to "not yet asked" and every write is best effort.
// Storage being unavailable must never crash a page, and the worst case is an
// ask that repeats rather than a page that breaks.
function hasAskedForMoment(moment) {
  try {
    return window.localStorage.getItem(MOMENT_KEY_PREFIX + moment) === "1";
  } catch {
    return false;
  }
}

function hasAskedThisSession() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

// Burns both budgets at once: this moment on this device, and the single ask
// allowed for this session. Called the instant the ask becomes visible, not
// when it is answered, because an ask that was seen and ignored has still been
// made and must not be repeated.
function recordAsk(moment) {
  try {
    window.localStorage.setItem(MOMENT_KEY_PREFIX + moment, "1");
  } catch {
    // Ignore: see above.
  }
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    // Ignore: see above.
  }
}

// The line that ties the ask to what just happened. Each one says why the home
// screen matters for the thing they have this second finished doing, which is
// the only reason this is worth asking at all.
const MOMENT_LINE_KEY = {
  follow: "install.moment.follow",
  lead: "install.moment.lead",
  merchant: "install.moment.merchant",
};

export function InstallMoment({ moment, active, className = "" }) {
  const { t } = useTranslation();
  const m = useUriMotion();
  const install = useInstallPrompt();
  // Set once this ask has claimed its budget, which is what keeps it on screen
  // afterwards: the moment the flags are written the eligibility test below
  // goes false, and without this the ask would appear and vanish in one frame.
  const [claimed, setClaimed] = useState(false);
  const [skipped, setSkipped] = useState(false);

  // Worked out before the claim so an environment with nothing to say, which is
  // desktop, never burns the one ask this session is allowed.
  const how = resolveInstallHow(t, install);

  const eligible =
    !!active &&
    !!how &&
    !!MOMENT_LINE_KEY[moment] &&
    // Already on the home screen: there is nothing to ask for.
    !install.isInstalled &&
    // The strip is on screen right now. Two install asks at once is nagging,
    // and the strip is already saying it, so this one stands down and keeps
    // its budget for a later moment when the strip is not there.
    !install.isStripVisible &&
    !hasAskedForMoment(moment) &&
    !hasAskedThisSession();

  useEffect(() => {
    if (claimed || !eligible) return;
    recordAsk(moment);
    setClaimed(true);
  }, [claimed, eligible, moment]);

  // Skipping is silent: the element goes, and nothing is said about it. No
  // toast, no confirmation, no second question. The budget was already burned
  // when it appeared, so it will not come back to ask again.
  if (skipped || !claimed) return null;
  // Installing while the ask is open removes it immediately, along with
  // everything else install related.
  if (install.isInstalled) return null;

  return (
    <motion.div
      initial={m.reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
      className={`rounded-2xl border border-crop-200 bg-crop-50 px-4 py-3 text-left ${className}`}
    >
      <p className="text-[13px] leading-snug text-ink-800">
        {t(MOMENT_LINE_KEY[moment])}
      </p>
      {/* Only on the browsers where there is no button to press. With a real
          prompt available the button below is the whole instruction. */}
      {how.how && (
        <p className="mt-1 text-[13px] leading-snug text-ink-600">{how.how}</p>
      )}

      <div className="mt-2.5 flex items-center gap-2">
        {how.canPrompt && (
          <motion.button
            type="button"
            onClick={install.promptInstall}
            whileTap={m.btnTap}
            className="inline-flex min-h-[44px] items-center justify-center rounded-[14px] bg-chilli-600 px-5 text-sm font-bold text-white transition-colors hover:bg-chilli-700"
          >
            {t("install.android.button")}
          </motion.button>
        )}
        <button
          type="button"
          onClick={() => setSkipped(true)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-[14px] px-3 text-sm font-semibold text-ink-500 hover:text-ink-800 transition-colors"
        >
          {t("install.close")}
        </button>
      </div>
    </motion.div>
  );
}

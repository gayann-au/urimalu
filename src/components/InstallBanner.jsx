import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  isStandalone,
  isInAppBrowser,
  getPlatform,
  getBrowserFamily,
} from "../lib/installEnvironment";
import { useInstallPrompt } from "../hooks/useInstallPrompt";
import { useAuth } from "../features/auth/useAuth";
import { useUriMotion } from "../lib/uiMotion";

// The install nudge. One strip, pinned to the bottom edge, on every page of the
// app for farmers and merchants alike, signed in or not.
//
// WHY A STRIP AND NOT A POPUP. The thing being offered here is a convenience,
// not a task, and the person reading is usually part way through something they
// actually came for. So this never dims the page, never sits on top of it, and
// never takes the tap that was meant for a button underneath. It publishes its
// own height as a CSS variable (see HEIGHT_VAR) and the app shell reserves that
// much room at the bottom, which is what keeps it off the end of a list and off
// the buttons that live down there.
//
// It reads only environment detection, the install hook, the current path, and
// localStorage. It never touches Supabase or any API.

// Set once we have confirmed a real install on this browser, so the strip never
// returns after the app has genuinely been installed here.
const INSTALLED_KEY = "urimalu_pwa_installed_confirmed";

// When the strip was last dismissed, as epoch milliseconds. A device
// preference, not user data, so it lives here and never in the database: the
// same person on a phone and a shared computer is making two different choices
// about two different home screens.
const DISMISSED_AT_KEY = "urimalu_pwa_dismissed_at";

// How long a dismissal lasts before the nudge may come back.
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

// Hold the strip back on first paint. It may appear only after the user has had
// a moment with the page: either six seconds pass, or they scroll or tap once,
// whichever comes first. This keeps the install nudge from ambushing arrival.
const REVEAL_DELAY_MS = 6 * 1000;

// The strip's own height, published to the document root so the app shell can
// reserve the same amount of room at the bottom of every page.
//
// Every reader must spell it var(--uri-install-h,0px), with the fallback. This
// property is only ever set while the strip is on screen, so on the pages where
// it never appears, and on the very first paint before this component has
// mounted, the fallback is the only thing standing between a bottom offset and
// an invalid calc() that the browser throws away. Current readers: the app
// shell in app/App.jsx, and the Ready to Sell floating trigger in
// features/sellerLeads/ReadyToSellCard.jsx.
const HEIGHT_VAR = "--uri-install-h";

// Routes where the visitor is part way through a job that must not be nudged:
// signing in, registering, recovering a password, or choosing a role. Matching
// is by prefix, so "/signup" covers both "/signup/farmer" and
// "/signup/merchant" without listing them.
const TASK_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/onboarding",
  "/forgot-password",
  "/reset-password",
];

// The in-app browsers we can name in the message. Anything else falls back to
// the generic wording, which says the same thing without naming an app.
const NAMED_IN_APP = new Set(["whatsapp", "instagram", "facebook", "line"]);

// True on the paths listed above. The trailing slash is trimmed so "/login/"
// and "/login" are the same page, and the prefix test requires a segment break
// so a future "/loginhelp" would not be swallowed by "/login".
function isTaskPath(pathname) {
  const path = (pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
  return TASK_PATH_PREFIXES.some(
    (base) => path === base || path.startsWith(`${base}/`)
  );
}

// A farmer who has not finished onboarding is shown a gate screen instead of
// the route they asked for, at whatever URL they happen to be on. See
// RequireFarmerName, RequireFarmerPhone and RequireFarmerDistrict in
// app/routes.jsx, which own this rule; the test is repeated here because those
// gates render above this component and cannot tell it what they are doing.
// Those screens are onboarding in everything but the URL, so the nudge stays
// away from them too.
function isOnOnboardingGate(profile) {
  if (!profile || profile.role !== "FARMER") return false;
  return (
    !profile.full_name?.trim() || !profile.phone?.trim() || !profile.district
  );
}

// True when a real install has been confirmed on this browser before. Any
// storage failure (private mode, blocked storage) is swallowed and treated as
// "not installed", so a storage error can never suppress a genuine prompt.
function isPermanentlyInstalled() {
  try {
    return window.localStorage.getItem(INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
}

// Records that the app has been installed on this browser, so the strip stays
// hidden permanently from now on.
function recordPermanentInstall() {
  try {
    window.localStorage.setItem(INSTALLED_KEY, "true");
  } catch {
    // Ignore: the flag simply will not persist when storage is unavailable,
    // meaning the strip may show again on this browser despite a real install.
  }
}

// True while a dismissal is still inside its seven days.
function isDismissalCurrent() {
  try {
    const raw = window.localStorage.getItem(DISMISSED_AT_KEY);
    if (!raw) return false;
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    const age = Date.now() - at;
    // A dismissal stamped in the future means the device clock has moved
    // backwards. Keep the strip hidden rather than treating the reading as
    // absent, because the alternative is a nudge that returns on every single
    // page load until the clock catches up.
    if (age < 0) return true;
    return age < DISMISS_MS;
  } catch {
    return false;
  }
}

// Records the moment of dismissal. A storage failure means the dismissal only
// lasts for this page, which is the safe direction to fail: the reader still
// got rid of it now.
function recordDismissal() {
  try {
    window.localStorage.setItem(DISMISSED_AT_KEY, String(Date.now()));
  } catch {
    // Ignore: see above.
  }
}

// Works out what this browser should be told, or null when there is nothing
// useful to say. Returns the message plus whether a real install button can be
// offered, so the renderer never has to guess which case it is in.
//
// Every branch returns a key that exists in both en.json and kn.json. There are
// deliberately no inline English fallbacks: a fallback would let a missing
// Kannada string ship silently as English, which is the exact bug this file
// used to have.
function resolveVariant(t, canInstall) {
  // 1. Inside a social or messaging in-app browser: no install of any kind can
  // work here, so steer the user to their real browser and name the app when
  // we know it.
  const inApp = isInAppBrowser();
  if (inApp.isInApp) {
    const key = NAMED_IN_APP.has(inApp.appName)
      ? `install.inApp.${inApp.appName}`
      : "install.inApp.generic";
    return { message: t(key), canPrompt: false };
  }

  const platform = getPlatform();

  // 2. iOS: Safari has no install prompt and never fires beforeinstallprompt,
  // so this is instructions only. Offering a button here would be offering a
  // button that cannot do anything.
  if (platform === "ios") {
    return { message: t("install.ios"), canPrompt: false };
  }

  // 3. Android.
  if (platform === "android") {
    // 3a. Eligible Chromium sent a beforeinstallprompt: offer the one-tap
    // native install.
    if (canInstall) {
      return { message: t("install.android.prompt"), canPrompt: true };
    }
    // 3b. No native prompt available: manual steps matched to the browser.
    const family = getBrowserFamily();
    if (family === "samsung-internet") {
      return { message: t("install.android.samsung"), canPrompt: false };
    }
    if (family === "firefox") {
      return { message: t("install.android.firefox"), canPrompt: false };
    }
    return { message: t("install.android.generic"), canPrompt: false };
  }

  // 4. Desktop and anything else: out of scope for now.
  return null;
}

function CloseIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export default function InstallBanner() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const location = useLocation();
  const { profile } = useAuth();
  // Hooks run unconditionally and before every decision below, so the set of
  // hooks never changes between renders. The install hook stays inert on
  // browsers that never fire beforeinstallprompt, so it costs nothing there.
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  // Seeded from storage so a dismissal made on an earlier visit is honoured on
  // the very first render, with no flash of a strip the reader already closed.
  const [dismissed, setDismissed] = useState(isDismissalCurrent);
  // Gate that holds the strip back until the reveal condition is met. It starts
  // false so nothing shows on the very first paint.
  const [ready, setReady] = useState(false);
  const cardRef = useRef(null);

  // Reveal the strip once the user has settled in: after REVEAL_DELAY_MS, or on
  // the first scroll or first tap/click anywhere, whichever happens first. All
  // triggers funnel through a single one-shot reveal so it can only fire once,
  // and everything is torn down on unmount.
  useEffect(() => {
    let revealed = false;
    let timerId = 0;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      window.clearTimeout(timerId);
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("pointerdown", reveal);
      setReady(true);
    };
    timerId = window.setTimeout(reveal, REVEAL_DELAY_MS);
    window.addEventListener("scroll", reveal, { passive: true });
    window.addEventListener("pointerdown", reveal);
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("pointerdown", reveal);
    };
  }, []);

  // Once a real install is confirmed for this session, remember it permanently
  // so the strip never returns on this browser.
  useEffect(() => {
    if (isInstalled) recordPermanentInstall();
  }, [isInstalled]);

  const handleClose = useCallback(() => {
    recordDismissal();
    setDismissed(true);
  }, []);

  // Every reason to stay silent, in order. Each one is a separate test because
  // each answers a different question, and collapsing them would make the next
  // person guess which condition a silent strip came from.
  const hidden =
    // Before the delay or first interaction, nothing at all.
    !ready ||
    // Already running installed. Both signals are checked inside isStandalone:
    // the standalone display-mode media query, and navigator.standalone for
    // iOS Safari, which does not report the media query.
    isStandalone() ||
    // Confirmed installed on this browser in the past.
    isPermanentlyInstalled() ||
    // Installed during this visit (appinstalled fired): hide immediately rather
    // than falling through to a manual-instructions branch.
    isInstalled ||
    // Dismissed within the last seven days.
    dismissed ||
    // Sign in, registration, password recovery, role choice.
    isTaskPath(location.pathname) ||
    // A farmer part way through the name, phone or district gates.
    isOnOnboardingGate(profile);

  const variant = hidden ? null : resolveVariant(t, canInstall);

  // Publish the strip's real measured height so the app shell can reserve that
  // much room at the bottom of every page, and clear it back to zero the moment
  // the strip is not on screen. Measured rather than hardcoded because the
  // message wraps to a different number of lines in each language, on each
  // browser, at each text size.
  useEffect(() => {
    const root = document.documentElement;
    const node = cardRef.current;
    if (!node) {
      root.style.setProperty(HEIGHT_VAR, "0px");
      return undefined;
    }

    const publish = () => {
      const height = Math.ceil(node.getBoundingClientRect().height);
      root.style.setProperty(HEIGHT_VAR, `${height}px`);
    };
    publish();

    // The height changes without this component re-rendering: a rotation, a
    // font size change, or a language switch all reflow the message.
    let observer;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(publish);
      observer.observe(node);
    }
    return () => {
      if (observer) observer.disconnect();
      root.style.setProperty(HEIGHT_VAR, "0px");
    };
  }, [variant?.message, variant?.canPrompt]);

  if (!variant) return null;

  return (
    // pointer-events-none on the full-width rail, restored only on the card
    // itself, so the strip cannot swallow a tap aimed at the page beside it.
    // z-20 sits under the Ready to Sell trigger (z-30), the assistant (z-40)
    // and the toasts (z-50): this is the least important thing on the screen
    // and it should lose every overlap.
    <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      <motion.div
        ref={cardRef}
        role="complementary"
        className="pointer-events-auto w-full max-w-[430px] rounded-2xl border border-ink-200 bg-white/95 shadow-uri-md backdrop-blur px-4 py-3"
        initial={m.reduce ? { opacity: 0 } : { opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
      >
        <div className="flex items-start gap-2">
          <p className="flex-1 text-[13px] leading-snug text-ink-700">
            {variant.message}
          </p>
          {/* A full 44px target, not a hairline cross. Dismissing is the one
              thing on this strip the reader is most likely to want, and it
              should never take two attempts. */}
          <button
            type="button"
            onClick={handleClose}
            aria-label={t("install.close")}
            className="shrink-0 -mr-1.5 -mt-1 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[14px] text-ink-500 hover:text-ink-900 hover:bg-ink-100 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>

        {variant.canPrompt && (
          <div className="mt-2 flex justify-end">
            <motion.button
              type="button"
              onClick={promptInstall}
              whileTap={m.btnTap}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[14px] bg-chilli-600 px-5 text-sm font-bold text-white transition-colors hover:bg-chilli-700"
            >
              {t("install.android.button")}
            </motion.button>
          </div>
        )}
      </motion.div>
    </div>
  );
}

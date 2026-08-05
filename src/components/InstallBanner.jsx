import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { useInstallPrompt } from "./InstallPromptProvider";
import { resolveInstallMessage } from "../lib/installMessage";
import { useAuth } from "../features/auth/useAuth";
import { isFreshSession } from "../lib/constants";
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
// It no longer listens for beforeinstallprompt itself. That event fires once
// per page load and can be spent once, and three components now need it, so it
// is captured in InstallPromptProvider and shared. This file reads that shared
// state and owns only its own dismissal, its reveal delay, and its height.

// When the strip was last dismissed, as epoch milliseconds. A device
// preference, not user data, so it lives here and never in the database: the
// same person on a phone and a shared computer is making two different choices
// about two different home screens.
const DISMISSED_AT_KEY = "urimalu_pwa_dismissed_at";

// How long a dismissal lasts before the nudge may come back.
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

// How long the strip waits before it may appear, and what else it waits for.
//
// The original rule, still the default everywhere: six seconds, or the first
// scroll or tap, whichever comes first. That is right for a page someone opened
// to do a job, where an unasked-for offer on arrival is an interruption.
//
// It was wrong for the two pages people actually arrive on. A farmer who lands
// on the feed, reads the morning's prices and leaves may never scroll and may
// never be there six seconds, so the strip that was meant to reach new users
// was the one thing they never saw. On those two pages it now shows after two
// seconds on its own, with nothing to trigger it.
//
// And someone who has just signed up or just signed in has this second chosen
// the app. Waiting to ask them is pointless caution, so that case waits for
// nothing at all.
const REVEAL_DELAY_MS = 6 * 1000;
const FAST_REVEAL_MS = 2 * 1000;

// The two pages a visitor arrives on rather than navigates to. Exact matches,
// not prefixes: "/feed" is the feed itself, and a future "/feed/something"
// would be a different, deeper page that has not earned the shorter wait.
const FAST_REVEAL_PATHS = new Set(["/", "/feed"]);

function isFastRevealPath(pathname) {
  const path = (pathname || "/").toLowerCase().replace(/\/+$/, "") || "/";
  return FAST_REVEAL_PATHS.has(path);
}

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
  // Shared install state. One listener for the whole app lives in the provider,
  // so nothing here competes for the deferred prompt.
  const install = useInstallPrompt();
  const { reportStripVisible } = install;
  // Seeded from storage so a dismissal made on an earlier visit is honoured on
  // the very first render, with no flash of a strip the reader already closed.
  const [dismissed, setDismissed] = useState(isDismissalCurrent);
  // Gate that holds the strip back until the reveal condition is met. It starts
  // false so nothing shows on the very first paint.
  const [ready, setReady] = useState(false);
  const cardRef = useRef(null);

  // Which of the three waits applies right now. Recomputed on navigation, so
  // walking from a deep page onto the feed switches to the shorter wait rather
  // than being stuck with the one that applied on arrival.
  const revealMode = isFreshSession()
    ? "immediate"
    : isFastRevealPath(location.pathname)
      ? "fast"
      : "settled";

  // Reveal the strip once its wait is over. Three modes:
  //
  //   immediate  they just signed up or signed in: no wait, no listeners
  //   fast       landing or feed: two seconds, and nothing else to trigger it
  //   settled    everywhere else: six seconds, or the first scroll or tap,
  //              whichever comes first. Unchanged from before.
  //
  // The scroll and pointer listeners are attached in settled mode ONLY. In fast
  // mode they would be pointless (the timer is shorter than any realistic first
  // interaction) and in immediate mode there is nothing to wait for.
  //
  // Guarded on ready so this can never un-reveal: once the strip has earned its
  // place, navigating to a slower page must not take it away again.
  useEffect(() => {
    if (ready) return undefined;

    if (revealMode === "immediate") {
      setReady(true);
      return undefined;
    }

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

    const settled = revealMode === "settled";
    timerId = window.setTimeout(reveal, settled ? REVEAL_DELAY_MS : FAST_REVEAL_MS);
    if (settled) {
      window.addEventListener("scroll", reveal, { passive: true });
      window.addEventListener("pointerdown", reveal);
    }
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener("scroll", reveal);
      window.removeEventListener("pointerdown", reveal);
    };
  }, [ready, revealMode]);

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
    // Already installed. The provider resolves all three signals behind this
    // one flag: the standalone display-mode media query, iOS
    // navigator.standalone, and a remembered appinstalled event.
    install.isInstalled ||
    // Dismissed within the last seven days.
    dismissed ||
    // Sign in, registration, password recovery, role choice.
    isTaskPath(location.pathname) ||
    // A farmer part way through the name, phone or district gates.
    isOnOnboardingGate(profile);

  const variant = hidden ? null : resolveInstallMessage(t, install);
  const visible = !!variant;

  // Tell the rest of the app whether the strip is on screen, so the moment
  // based asks can stand down while it is showing rather than each keeping its
  // own copy of these rules. Reported from an effect, never during render.
  useEffect(() => {
    reportStripVisible(visible);
    return () => reportStripVisible(false);
  }, [visible, reportStripVisible]);

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
              onClick={install.promptInstall}
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

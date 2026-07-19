import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  isStandalone,
  isInAppBrowser,
  getPlatform,
  getBrowserFamily,
} from "../lib/installEnvironment";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

// Slim, dismissible install prompt strip. It never renders when the app is
// already installed, when it was confirmed installed on this browser before,
// when it was dismissed during this visit, or on desktop. On mobile it adapts
// to the environment: a "open in your browser" nudge inside social/messaging
// webviews, manual Add to Home Screen steps on iOS, the native install button
// on eligible Android Chromium, and per-browser manual steps on Android
// otherwise. It reads only environment detection, the install hook, and
// localStorage. It never touches Supabase or any API.

// Set once we have confirmed a real install on this browser, so the popup never
// returns after the app has genuinely been installed here.
const INSTALLED_KEY = "urimalu_pwa_installed_confirmed";

// Hold the popup back on first paint. It may appear only after the user has had
// a moment with the page: either six seconds pass, or they scroll or tap once,
// whichever comes first. This keeps the install nudge from ambushing arrival.
const REVEAL_DELAY_MS = 6 * 1000;

// Human-facing labels for the known in-app browsers. Detection returns lowercase
// keys; these are the names users actually see in their app.
const IN_APP_LABEL = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  line: "Line",
};

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

// Records that the app has been installed on this browser, so the popup stays
// hidden permanently from now on.
function recordPermanentInstall() {
  try {
    window.localStorage.setItem(INSTALLED_KEY, "true");
  } catch {
    // Ignore: the flag simply will not persist when storage is unavailable,
    // meaning the popup may show again on this browser despite a real install.
  }
}

function CloseIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

// Shared chrome for every variant: a full-screen dimmed backdrop with a
// centered card on top, matching the modal pattern used elsewhere in the app
// (see DistrictPicker). Tapping the backdrop outside the card dismisses it the
// same way the close button does. `children` carries the variant-specific
// message and any action button.
function Strip({ children, onClose, closeLabel }) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-40 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] bg-paper rounded-t-3xl sm:rounded-3xl shadow-xl p-6 sm:m-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 text-sm text-ink-800 leading-snug">{children}</div>
          <button
            type="button"
            onClick={onClose}
            aria-label={closeLabel}
            className="shrink-0 inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[14px] text-ink-500 hover:text-ink-800 hover:bg-ink-50 transition-colors"
          >
            <CloseIcon />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function InstallBanner() {
  const { t } = useTranslation();
  // Hooks must run unconditionally, so the install hook is called before any of
  // the early returns below. It stays inert on browsers that never fire
  // beforeinstallprompt, so this costs nothing there.
  const { canInstall, isInstalled, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  // Gate that holds the popup back until the reveal condition is met. It starts
  // false so nothing shows on the very first paint.
  const [ready, setReady] = useState(false);

  // Reveal the popup once the user has settled in: after REVEAL_DELAY_MS, or on
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
  // so the popup never returns on this browser.
  useEffect(() => {
    if (isInstalled) recordPermanentInstall();
  }, [isInstalled]);

  // Reveal gate: before the delay or first interaction, render nothing at all,
  // regardless of what the priority checks below would otherwise decide.
  if (!ready) return null;

  // 1. Already installed: nothing to offer, ever.
  if (isStandalone()) return null;

  // 1a. Confirmed installed on this browser in the past: stay hidden forever.
  if (isPermanentlyInstalled()) return null;

  // 1b. Installed during this visit (appinstalled fired): hide immediately
  // instead of falling through to a manual-instructions branch.
  if (isInstalled) return null;

  // 2. Dismissed during this visit: stay hidden until the next load.
  if (dismissed) return null;

  const handleClose = () => {
    setDismissed(true);
  };

  const closeLabel = t("install.close", "Close");

  // 3. Inside a social or messaging in-app browser: the native install cannot
  // work here, so steer the user to their real browser and name the app when we
  // know it.
  const inApp = isInAppBrowser();
  if (inApp.isInApp) {
    const label = IN_APP_LABEL[inApp.appName];
    const message = label
      ? t(
          `install.inApp.${inApp.appName}`,
          `You are viewing this inside ${label}. Open this page in your browser to add Urimalu to your home screen.`
        )
      : t(
          "install.inApp.generic",
          "Open this page in your browser to add Urimalu to your home screen."
        );
    return (
      <Strip onClose={handleClose} closeLabel={closeLabel}>
        {message}
      </Strip>
    );
  }

  const platform = getPlatform();

  // 4. iOS: no programmatic install exists, so give the manual Share then Add to
  // Home Screen steps.
  if (platform === "ios") {
    return (
      <Strip onClose={handleClose} closeLabel={closeLabel}>
        {t(
          "install.ios",
          "To install Urimalu, tap the Share icon, then choose Add to Home Screen."
        )}
      </Strip>
    );
  }

  // 5. Android.
  if (platform === "android") {
    // 5a. Eligible Chromium sent a beforeinstallprompt: offer the one-tap
    // native install button.
    if (canInstall) {
      return (
        <Strip onClose={handleClose} closeLabel={closeLabel}>
          <div className="flex items-center gap-3">
            <span className="flex-1">
              {t("install.android.prompt", "Add Urimalu to your home screen.")}
            </span>
            <button
              type="button"
              onClick={promptInstall}
              className="shrink-0 inline-flex min-h-[44px] items-center justify-center rounded-[14px] border-2 border-chilli-600 bg-chilli-600 text-white font-bold text-sm px-5 hover:bg-chilli-700 hover:border-chilli-700 transition-colors"
            >
              {t("install.android.button", "Install")}
            </button>
          </div>
        </Strip>
      );
    }

    // 5b. No native prompt available: manual steps matched to the browser.
    const family = getBrowserFamily();
    let manual;
    if (family === "samsung-internet") {
      manual = t(
        "install.android.samsung",
        "To install Urimalu, open the Samsung Internet menu and choose Add page to, then Home screen."
      );
    } else if (family === "firefox") {
      manual = t(
        "install.android.firefox",
        "To install Urimalu, open the Firefox menu and choose Install, or Add to Home screen."
      );
    } else {
      manual = t(
        "install.android.generic",
        "To install Urimalu, look for an install or Add to Home screen option in your browser menu."
      );
    }
    return (
      <Strip onClose={handleClose} closeLabel={closeLabel}>
        {manual}
      </Strip>
    );
  }

  // 6. Desktop and anything else: out of scope for now.
  return null;
}

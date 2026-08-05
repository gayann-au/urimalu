import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  isStandalone,
  isInAppBrowser,
  getPlatform,
  getBrowserFamily,
} from "../lib/installEnvironment";

// The one place in the app that listens for beforeinstallprompt.
//
// WHY THIS EXISTS. beforeinstallprompt fires once per page load, and the event
// object it carries can be prompted exactly once. Two components listening
// separately do not both get it: whichever mounted first captures it and the
// other waits forever, so its install button is dead on Android with nothing on
// screen to say why. Three components now need to offer an install, so the
// event is captured here, once, and never handed out.
//
// HOW ONE PROMPT IS SHARED BY THREE COMPONENTS.
//   1. The event never leaves this file. It lives in deferredRef. Consumers get
//      promptInstall, a function, and cannot reach the event to spend it.
//   2. There is exactly one listener in the app, so there is no race to capture
//      and no ordering dependency between the components that use it.
//   3. canInstall is derived state pushed to every consumer at once. When the
//      prompt is spent, the ref is cleared and canInstall goes false in the same
//      commit, so all three components stop offering a button simultaneously.
//      None of them can render a button backed by a spent event.
//   4. Two components calling promptInstall in the same moment (or one double
//      tap) would call prompt() twice on one event, which throws
//      InvalidStateError. inFlightRef coalesces concurrent calls onto the single
//      pending promise instead.
//   5. Chrome re-fires beforeinstallprompt on a later navigation when the user
//      dismissed the native dialog. This listener is permanent, so it simply
//      re-captures and canInstall returns to true for everyone with no
//      resubscription anywhere.
//
// All environment detection is imported from lib/installEnvironment.js. None of
// it is reimplemented here.

// Set once a real install is confirmed on this browser, so nothing install
// related ever returns after the app has genuinely been installed here.
const INSTALLED_KEY = "urimalu_pwa_installed_confirmed";

const InstallPromptContext = createContext(null);

// True when a real install was confirmed on this browser before. Any storage
// failure (private mode, blocked storage) is treated as "not installed", so a
// storage error can never suppress a genuine prompt.
function readInstalledFlag() {
  try {
    return window.localStorage.getItem(INSTALLED_KEY) === "true";
  } catch {
    return false;
  }
}

function writeInstalledFlag() {
  try {
    window.localStorage.setItem(INSTALLED_KEY, "true");
  } catch {
    // Ignore: the flag will not persist when storage is unavailable, meaning
    // the install offers may return on this browser despite a real install.
  }
}

export function InstallPromptProvider({ children }) {
  // The captured event. A ref, not state: the object itself never needs to
  // trigger a render, only the derived flags below do, and keeping it out of
  // state is what stops it being passed around by accident.
  const deferredRef = useRef(null);
  // The pending promptInstall call, if one is open. See point 4 above.
  const inFlightRef = useRef(null);

  const [canInstall, setCanInstall] = useState(false);
  // Seeded from both signals that survive a reload: the standalone display
  // mode (and iOS navigator.standalone, both checked inside isStandalone) and
  // the persisted flag from a past appinstalled event.
  const [isInstalled, setIsInstalled] = useState(
    () => isStandalone() || readInstalledFlag()
  );
  // Whether the bottom strip is on screen right now. InstallBanner reports its
  // own visibility here so the moment based asks can stay quiet while it is
  // showing, rather than each guessing at the other's rules.
  const [isStripVisible, setIsStripVisible] = useState(false);

  // Detection reads the user agent, which cannot change for the life of the
  // page, so this runs once and is shared by every consumer.
  const environment = useMemo(() => {
    const inApp = isInAppBrowser();
    const platform = getPlatform();
    return {
      inApp,
      platform,
      browserFamily: getBrowserFamily(),
      // The single value callers switch on. In-app wins over the platform
      // because no install of any kind works inside a social webview, whatever
      // phone it is running on.
      surface: inApp.isInApp ? "in-app" : platform,
    };
  }, []);

  useEffect(() => {
    function handleBeforeInstallPrompt(event) {
      // Suppress Chrome's own mini-infobar so our UI is the single entry point.
      event.preventDefault();
      deferredRef.current = event;
      setCanInstall(true);
    }

    function handleAppInstalled() {
      deferredRef.current = null;
      inFlightRef.current = null;
      setCanInstall(false);
      setIsInstalled(true);
      writeInstalledFlag();
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Launching the installed app can flip the standalone media query without a
  // fresh page load, and appinstalled does not fire in that window. Watching
  // the query means everything install related disappears the moment the app
  // is running installed, not on the next reload.
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const query = window.matchMedia("(display-mode: standalone)");
    const onChange = (e) => {
      if (!e.matches) return;
      setIsInstalled(true);
      writeInstalledFlag();
    };
    // Safari below 14 has only the deprecated addListener.
    if (query.addEventListener) query.addEventListener("change", onChange);
    else query.addListener(onChange);
    return () => {
      if (query.removeEventListener) query.removeEventListener("change", onChange);
      else query.removeListener(onChange);
    };
  }, []);

  // Returns "accepted", "dismissed", or "unavailable". Never throws, so every
  // caller can treat it as fire and forget.
  const promptInstall = useCallback(async () => {
    // A second caller joins the call already running rather than starting a
    // new one on a spent event.
    if (inFlightRef.current) return inFlightRef.current;

    const deferred = deferredRef.current;
    // No captured event is the normal case on iOS, in webviews, on Firefox,
    // and on any Chromium that decided the moment is not right. Quiet return,
    // never an error: no caller should render a button when canInstall is
    // false, and this is the backstop for the race where it just went false.
    if (!deferred) return "unavailable";

    const run = (async () => {
      try {
        deferred.prompt();
        const choice = await deferred.userChoice;
        return choice?.outcome || "dismissed";
      } catch {
        // prompt() throws if the event was already spent. Treat it the same as
        // having no event: the UI is about to stop offering it either way.
        return "unavailable";
      } finally {
        // The event is spent whatever the user chose, so it is dropped and
        // every consumer loses its button in this same update.
        deferredRef.current = null;
        inFlightRef.current = null;
        setCanInstall(false);
      }
    })();

    inFlightRef.current = run;
    return run;
  }, []);

  const reportStripVisible = useCallback((visible) => {
    setIsStripVisible((current) => (current === visible ? current : visible));
  }, []);

  const value = useMemo(
    () => ({
      ...environment,
      // True only when a real, unspent prompt is held. Once installed, nothing
      // is offered at all, which keeps every consumer from having to test both.
      canInstall: canInstall && !isInstalled,
      isInstalled,
      promptInstall,
      isStripVisible,
      reportStripVisible,
    }),
    [environment, canInstall, isInstalled, promptInstall, isStripVisible, reportStripVisible]
  );

  return (
    <InstallPromptContext.Provider value={value}>
      {children}
    </InstallPromptContext.Provider>
  );
}

// Reads the shared install state. Throws when used outside the provider,
// because the silent alternative is a component that renders an install button
// which can never work.
export function useInstallPrompt() {
  const ctx = useContext(InstallPromptContext);
  if (!ctx) {
    throw new Error("useInstallPrompt must be used inside InstallPromptProvider");
  }
  return ctx;
}

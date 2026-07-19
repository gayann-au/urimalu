// React hook that manages the browser's native PWA install flow.
//
// Important: this hook is inert on any browser that does not fire the
// beforeinstallprompt event. On those browsers (iOS Safari, most in-app
// webviews, Firefox, and any Chromium browser that decides the app is not
// eligible or the moment is not right) canInstall simply stays false forever,
// and calling promptInstall does nothing. That is the normal, expected case and
// must never be treated as an error state anywhere this hook is used. Callers
// that want to offer install guidance on those browsers should key off platform
// detection instead, not off this hook reporting a failure, because it never
// reports one.

import { useCallback, useEffect, useRef, useState } from "react";

export function useInstallPrompt() {
  // The captured beforeinstallprompt event lives in a ref, not state. The event
  // object itself never needs to trigger a re-render; only the derived boolean
  // flags below do. A beforeinstallprompt event can also be used only once, so
  // the ref is cleared after it is consumed.
  const deferredPromptRef = useRef(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Fired by eligible Chromium browsers when the app can be installed. We
    // prevent the browser's own mini-infobar so our UI is the single install
    // entry point, stash the event for later, and flag that an install is
    // available.
    function handleBeforeInstallPrompt(event) {
      event.preventDefault();
      deferredPromptRef.current = event;
      setCanInstall(true);
    }

    // Fired once the app has actually been installed. There is nothing left to
    // prompt, so drop any stored event and mark the installed state.
    function handleAppInstalled() {
      deferredPromptRef.current = null;
      setIsInstalled(true);
      setCanInstall(false);
    }

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const deferredPrompt = deferredPromptRef.current;
    // No captured event means the browser never offered an install. This is the
    // normal case on most browsers, so return quietly without throwing.
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    // Wait for the user's choice so callers can await this call, but do not
    // branch on the outcome: whether the user accepted or dismissed, the event
    // is now spent and cannot be reused.
    await deferredPrompt.userChoice;

    deferredPromptRef.current = null;
    setCanInstall(false);
  }, []);

  return { canInstall, isInstalled, promptInstall };
}

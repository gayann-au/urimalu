// Pure environment-detection helpers for PWA install support.
//
// These functions only inspect the current browser environment (user agent,
// display mode, touch points). They are side-effect free: no event listeners,
// no beforeinstallprompt capture, no React. That deferred-prompt wiring belongs
// in a later step. Every function is safe to call during server-side rendering
// or before the DOM is ready, so each one guards access to window and navigator
// and falls back to a sensible default when they are missing.

// Reads navigator.userAgent defensively. Returns an empty string when there is
// no navigator (SSR, or a very early call), so every substring check below can
// run without throwing.
function getUserAgent() {
  if (typeof navigator === "undefined" || !navigator) return "";
  return navigator.userAgent || "";
}

// Returns one of "ios", "android", "desktop".
//
// iPadOS 13+ reports a desktop Mac user agent, so a real iPad is detected by a
// Mac user agent combined with a touch screen (maxTouchPoints > 1). Older iOS
// devices still identify themselves directly as iPhone, iPad, or iPod.
export function getPlatform() {
  const ua = getUserAgent();
  if (!ua) return "desktop";

  const isClassicIOS = /iPhone|iPad|iPod/.test(ua);
  const maxTouchPoints =
    typeof navigator !== "undefined" && navigator
      ? navigator.maxTouchPoints || 0
      : 0;
  const isIpadOSMasqueradingAsMac = /Macintosh/.test(ua) && maxTouchPoints > 1;

  if (isClassicIOS || isIpadOSMasqueradingAsMac) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

// Returns { isInApp, appName }, where appName is "whatsapp", "instagram",
// "facebook", "line", or null. In-app browsers (webviews embedded in messaging
// and social apps) often cannot trigger a native install prompt, so callers use
// this to decide whether to show manual install guidance instead.
export function isInAppBrowser() {
  const ua = getUserAgent();
  if (!ua) return { isInApp: false, appName: null };

  // Facebook exposes itself through FBAN (app name) or FBAV (app version).
  if (/WhatsApp/i.test(ua)) return { isInApp: true, appName: "whatsapp" };
  if (/Instagram/i.test(ua)) return { isInApp: true, appName: "instagram" };
  if (/FBAN|FBAV/i.test(ua)) return { isInApp: true, appName: "facebook" };
  if (/\bLine\//i.test(ua)) return { isInApp: true, appName: "line" };

  return { isInApp: false, appName: null };
}

// Returns true when the app is already installed and running as a standalone
// PWA. Chromium and Firefox expose this through the standalone display-mode
// media query. iOS Safari does not, and instead sets navigator.standalone, so
// both signals are checked.
export function isStandalone() {
  if (typeof window !== "undefined" && window && typeof window.matchMedia === "function") {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  }
  if (typeof navigator !== "undefined" && navigator && navigator.standalone === true) {
    return true;
  }
  return false;
}

// Returns one of "chrome", "samsung-internet", "firefox", "safari", "edge",
// "other".
//
// Order matters because several Chromium browsers include "Chrome" in their
// user agent. Edge (Edg on desktop, EdgA on Android, EdgiOS on iPhone) and
// Samsung Internet (SamsungBrowser) are checked before Chrome so they are not
// misclassified, and plain Chrome is checked last among the Chromium family.
// Safari is checked only after ruling out Chromium, since Chromium user agents
// also contain "Safari".
export function getBrowserFamily() {
  const ua = getUserAgent();
  if (!ua) return "other";

  if (/Edg\/|EdgA\/|EdgiOS\//.test(ua)) return "edge";
  if (/SamsungBrowser/.test(ua)) return "samsung-internet";
  if (/Firefox\/|FxiOS/.test(ua)) return "firefox";
  if (/Chrome\/|CriOS/.test(ua)) return "chrome";
  if (/Safari/.test(ua)) return "safari";
  return "other";
}

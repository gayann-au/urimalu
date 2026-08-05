// Which install words belong on screen, given the environment the provider
// already detected. Pure: it takes the i18next t function and the environment,
// and returns strings. No detection, no React, no storage.
//
// This exists so the strip, the inline card, and the moment based asks cannot
// drift apart. They say the same thing in the same order for the same browser;
// only the surface differs.
//
// Nothing here ever says download, install file, app store, or Play Store,
// because none of those happen. The browser adds a shortcut to the home screen.

// The in-app browsers we can name. Anything else gets the generic wording,
// which says the same thing without naming an app.
const NAMED_IN_APP = new Set(["whatsapp", "instagram", "facebook", "line"]);

// The full message: a reason to install plus, where there is no button, the
// steps for this exact browser. Used by the strip and the inline card.
//
// Returns null when there is nothing useful to say, which is desktop and
// anything unrecognised. Returns { message, canPrompt }, where canPrompt true
// means a real install button should be shown next to the message and false
// means the message already carries the manual steps.
export function resolveInstallMessage(t, { surface, inApp, browserFamily, canInstall }) {
  if (surface === "in-app") {
    const key = NAMED_IN_APP.has(inApp.appName)
      ? `install.inApp.${inApp.appName}`
      : "install.inApp.generic";
    return { message: t(key), canPrompt: false };
  }

  // iOS Safari has no install prompt and never fires beforeinstallprompt, so
  // this is instructions only. A button here would be a button that cannot work.
  if (surface === "ios") {
    return { message: t("install.ios"), canPrompt: false };
  }

  if (surface === "android") {
    if (canInstall) {
      return { message: t("install.android.prompt"), canPrompt: true };
    }
    if (browserFamily === "samsung-internet") {
      return { message: t("install.android.samsung"), canPrompt: false };
    }
    if (browserFamily === "firefox") {
      return { message: t("install.android.firefox"), canPrompt: false };
    }
    return { message: t("install.android.generic"), canPrompt: false };
  }

  return null;
}

// Just the how, with no reason attached. Used by the moment based asks, where
// the reason is already carried by a line tied to what the person just did, and
// repeating "it opens faster and price alerts reach your phone" underneath it
// would be saying the same thing twice in three sentences.
//
// Returns null on desktop and anything unrecognised, the same as above.
export function resolveInstallHow(t, { surface, canInstall }) {
  if (surface === "in-app") return { how: t("install.how.inApp"), canPrompt: false };
  if (surface === "ios") return { how: t("install.how.ios"), canPrompt: false };
  if (surface === "android") {
    // With a real prompt available the button is the how, so there is no line
    // to read. Without one, a single set of steps covers every Android browser:
    // the per browser wording is worth it in the strip, where it is the whole
    // message, and is noise under a sentence about the thing they just did.
    if (canInstall) return { how: null, canPrompt: true };
    return { how: t("install.how.android"), canPrompt: false };
  }
  return null;
}

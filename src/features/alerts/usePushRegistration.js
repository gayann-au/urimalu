import { useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/useAuth";

// Web push registration. Everything here is best-effort and must never break
// the app: push is a bonus on top of the in-app notifications, so every path
// swallows its errors and simply leaves the user on in-app-only.
//
// The permission prompt is triggered from a real user action (a crop follow for
// farmers, a saved listing or the approval welcome card for merchants), never
// on page load, and only once: the browser remembers granted/denied, and a
// local flag stops us re-prompting a user who dismissed the prompt without
// choosing (which the browser keeps as "default").
//
// EVERY EXIT SAYS WHY, TWICE. This file used to end each failure at a bare
// `catch {}` with no logging, and the result was that push registration failed
// for every device for weeks with nothing anywhere to show it. Console warnings
// fixed that for a developer at a desk and fixed nothing at all for a farmer on
// a phone, whose console nobody can read. So every exit now does two things: it
// warns, and it RETURNS A RESULT STRING naming the same reason. The result is
// what the diagnostics screen puts on the phone's own display.
//
// THE SPLIT, AND WHY IT MATTERS MORE THAN IT LOOKS.
// requestPushPermission and savePushSubscription are separate on purpose.
// Asking for notification permission needs a live user gesture, and a gesture
// expires: on a slow connection the network round trip of a listing write can
// outlast it, at which point the browser refuses the request and nothing is
// ever asked. So the ask has to ride the tap itself, while the parts that need
// the network (subscribing, and storing the subscription) run afterwards.
// promptForPush still does both in order, for callers already inside a gesture
// that have no reason to hold the two halves apart.

const PROMPTED_FLAG = "urimalu.pushPrompted";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const LOG = "[push]";

// Every reason this code can stop, as a string a screen can show. Kept as one
// frozen map so the hook, the console warnings and the diagnostics panel cannot
// drift into three different vocabularies for the same event. No product or
// company names anywhere in here: these strings reach a user's screen.
export const PUSH_RESULT = Object.freeze({
  NO_PROFILE: "no-profile",
  NO_WINDOW: "no-window",
  NO_NOTIFICATION_API: "no-notification-api",
  NO_SERVICE_WORKER_SUPPORT: "no-service-worker-support",
  NO_PUSH_MANAGER: "no-push-manager",
  NO_VAPID_KEY: "no-vapid-key",
  PERMISSION_ALREADY_DENIED: "permission-already-denied",
  ALREADY_PROMPTED: "already-prompted",
  PERMISSION_REQUEST_BLOCKED: "permission-request-blocked",
  PERMISSION_DENIED: "permission-denied",
  PERMISSION_DISMISSED: "permission-dismissed",
  PERMISSION_GRANTED: "permission-granted",
  PERMISSION_NOT_GRANTED: "permission-not-granted",
  NO_SERVICE_WORKER_REGISTRATION: "no-service-worker-registration",
  DATABASE_SAVE_FAILED: "database-save-failed",
  SUBSCRIPTION_SAVED: "subscription-saved",
  UNEXPECTED_ERROR: "unexpected-error",
});

// Which requirement for web push this browser is missing, or null when it has
// all of them. Silent by design: the diagnostics reader calls this and must not
// spray the console every time the panel refreshes. pushSupported below is the
// noisy wrapper the registration paths use.
function supportFailure() {
  if (typeof window === "undefined") return PUSH_RESULT.NO_WINDOW;
  if (!("Notification" in window)) return PUSH_RESULT.NO_NOTIFICATION_API;
  if (!("serviceWorker" in navigator)) return PUSH_RESULT.NO_SERVICE_WORKER_SUPPORT;
  if (!("PushManager" in window)) return PUSH_RESULT.NO_PUSH_MANAGER;
  if (!VAPID_PUBLIC_KEY) return PUSH_RESULT.NO_VAPID_KEY;
  return null;
}

// Human sentence for each stopping reason, for the console only.
const REASON_TEXT = {
  [PUSH_RESULT.NO_PROFILE]: "no profile, nobody to attach the subscription to.",
  [PUSH_RESULT.NO_WINDOW]: "no window (server-side render).",
  [PUSH_RESULT.NO_NOTIFICATION_API]: "this browser has no Notification API.",
  [PUSH_RESULT.NO_SERVICE_WORKER_SUPPORT]: "this browser has no service worker support.",
  [PUSH_RESULT.NO_PUSH_MANAGER]: "this browser has no PushManager. On an iPhone this is what a page open in a browser tab looks like: push is only available once the app has been added to the Home Screen and opened from there.",
  [PUSH_RESULT.NO_VAPID_KEY]: "VITE_VAPID_PUBLIC_KEY is not set in this build.",
  [PUSH_RESULT.PERMISSION_ALREADY_DENIED]: "notification permission was already denied on this browser.",
  [PUSH_RESULT.ALREADY_PROMPTED]: "already prompted flag is set, this browser was asked once before.",
  [PUSH_RESULT.PERMISSION_DENIED]: "the user denied the permission prompt.",
  [PUSH_RESULT.PERMISSION_DISMISSED]: "the user dismissed the permission prompt without choosing.",
  [PUSH_RESULT.PERMISSION_NOT_GRANTED]: "permission is not granted, so there is nothing to subscribe.",
  [PUSH_RESULT.NO_SERVICE_WORKER_REGISTRATION]: "no service worker registration on this page.",
};

// Warn and hand the same reason back to the caller, so the console line and the
// on-screen line can never disagree about what happened.
function stop(result) {
  console.warn(`${LOG} not registering: ${REASON_TEXT[result] || result}`);
  return result;
}

// VAPID public key (base64url) to the Uint8Array applicationServerKey wants.
function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// The host a push endpoint points at, and nothing else from it.
//
// The endpoint itself is a capability: anyone holding it can push to this
// device. It is never returned from this module and never rendered. The
// hostname alone is what a diagnosis needs, because it says which delivery
// service the browser signed up with, and it carries no secret.
function endpointHost(endpoint) {
  try {
    return new URL(endpoint).hostname;
  } catch {
    return null;
  }
}

// localStorage throws outright in some privacy modes, so both the read and the
// write of the one-shot flag are guarded. A flag we cannot read is treated as
// unset: asking a user twice is a far smaller harm than never asking at all.
function promptedFlagSet() {
  try {
    return !!localStorage.getItem(PROMPTED_FLAG);
  } catch (err) {
    console.warn(`${LOG} could not read the prompted flag, treating it as unset:`, err);
    return false;
  }
}

function setPromptedFlag() {
  try {
    localStorage.setItem(PROMPTED_FLAG, "1");
  } catch (err) {
    console.warn(`${LOG} could not write the prompted flag, this browser may be asked again:`, err);
  }
}

// Clear the one-shot flag. Exists for the diagnostics screen, so one phone can
// be tested over and over instead of being spent on the first attempt. Nothing
// in the normal app calls this.
export function clearPromptedFlag() {
  try {
    localStorage.removeItem(PROMPTED_FLAG);
    return true;
  } catch (err) {
    console.warn(`${LOG} could not clear the prompted flag:`, err);
    return false;
  }
}

// A plain snapshot of everything that decides whether push can work here.
//
// READ ONLY. It never prompts, never subscribes and never writes, so it is safe
// to call on page load from a diagnostics screen. It also never returns a
// secret: the VAPID key is reported as a yes or no and never as its value, the
// endpoint is reduced to its hostname, and the subscription keys are not read
// at all.
export async function readPushDiagnostics() {
  const hasWindow = typeof window !== "undefined";
  const hasNotification = hasWindow && "Notification" in window;
  const hasServiceWorker = hasWindow && "serviceWorker" in navigator;
  const hasPushManager = hasWindow && "PushManager" in window;

  const diagnostics = {
    hasWindow,
    hasNotification,
    hasServiceWorker,
    hasPushManager,
    hasVapidKey: !!VAPID_PUBLIC_KEY,
    permission: hasNotification ? Notification.permission : "unavailable",
    hasServiceWorkerRegistration: false,
    hasPushSubscription: false,
    pushEndpointHost: null,
    promptedFlagSet: promptedFlagSet(),
    readError: null,
  };

  if (!hasServiceWorker) return diagnostics;

  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return diagnostics;
    diagnostics.hasServiceWorkerRegistration = true;

    if (!hasPushManager || !reg.pushManager) return diagnostics;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return diagnostics;

    diagnostics.hasPushSubscription = true;
    diagnostics.pushEndpointHost = endpointHost(sub.endpoint);
  } catch (err) {
    diagnostics.readError = err?.message || String(err);
  }

  return diagnostics;
}

// Subscribe this browser and store the subscription for the given user. Safe to
// call repeatedly: pushManager reuses an existing subscription, and the DB
// upsert is keyed on the endpoint so duplicates never accumulate.
async function subscribeAndSave(userId) {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    // No service worker (for example the dev server): nothing to subscribe to.
    return stop(PUSH_RESULT.NO_SERVICE_WORKER_REGISTRATION);
  }

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON(); // { endpoint, keys: { p256dh, auth } }
  // The upsert result used to be discarded. A row that never lands is the one
  // failure that leaves the browser perfectly subscribed and the server unable
  // to reach it, so it is checked and named here.
  const { error } = await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: json.endpoint, keys: json.keys },
    { onConflict: "endpoint" }
  );
  if (error) {
    console.warn(
      `${LOG} storing the subscription failed, this device will not receive push:`,
      error.message || error
    );
    return PUSH_RESULT.DATABASE_SAVE_FAILED;
  }
  return PUSH_RESULT.SUBSCRIPTION_SAVED;
}

export function usePushRegistration() {
  const { profile } = useAuth();

  // THE GESTURE HALF. Ask the browser for notification permission.
  //
  // MUST be called from inside a live user gesture, and MUST NOT have anything
  // awaited in front of it in the calling handler. Everything above the
  // requestPermission call below runs synchronously in the caller's own task,
  // which is exactly what keeps the gesture alive; a single awaited network
  // call in front of this is enough to lose it on a phone.
  //
  // Returns one of PUSH_RESULT. Never throws.
  const requestPushPermission = useCallback(async () => {
    try {
      if (!profile) return stop(PUSH_RESULT.NO_PROFILE);
      const failure = supportFailure();
      if (failure) return stop(failure);

      const permission = Notification.permission;

      // Already decided against it: respect that, never nag again.
      if (permission === "denied") return stop(PUSH_RESULT.PERMISSION_ALREADY_DENIED);

      // Already granted: nothing to ask. The caller moves on to the save half.
      if (permission === "granted") return PUSH_RESULT.PERMISSION_GRANTED;

      // permission === "default": ask exactly once, ever, on this browser.
      if (promptedFlagSet()) return stop(PUSH_RESULT.ALREADY_PROMPTED);

      // THE FLAG IS WRITTEN AFTER THE ANSWER, NEVER BEFORE IT.
      //
      // If the gesture has expired the browser rejects this call outright.
      // Setting the flag first meant that rejection burned the one shot: the
      // user was marked as asked, no prompt had appeared, and nothing would
      // ever ask again on that device. A throw now leaves the flag unset so a
      // later attempt can still ask.
      let result;
      try {
        result = await Notification.requestPermission();
      } catch (err) {
        console.warn(
          `${LOG} not registering: the browser refused the permission request, most likely because the user gesture had already expired. Leaving the prompted flag unset so a later attempt can still ask:`,
          err
        );
        return PUSH_RESULT.PERMISSION_REQUEST_BLOCKED;
      }
      setPromptedFlag();

      if (result === "granted") return PUSH_RESULT.PERMISSION_GRANTED;
      // Denied or dismissed: do nothing. In-app notifications keep working.
      if (result === "denied") return stop(PUSH_RESULT.PERMISSION_DENIED);
      return stop(PUSH_RESULT.PERMISSION_DISMISSED);
    } catch (err) {
      console.warn(`${LOG} the permission request failed unexpectedly:`, err);
      return PUSH_RESULT.UNEXPECTED_ERROR;
    }
  }, [profile]);

  // THE NETWORK HALF. Subscribe this browser and store the subscription.
  //
  // Needs no gesture, so it is safe to run after an awaited write. It requires
  // permission to be granted already and never prompts.
  //
  // Returns one of PUSH_RESULT. Never throws.
  const savePushSubscription = useCallback(async () => {
    try {
      if (!profile) return stop(PUSH_RESULT.NO_PROFILE);
      const failure = supportFailure();
      if (failure) return stop(failure);
      if (Notification.permission !== "granted") {
        return stop(PUSH_RESULT.PERMISSION_NOT_GRANTED);
      }
      return await subscribeAndSave(profile.id);
    } catch (err) {
      console.warn(`${LOG} registration failed and this device will not receive push:`, err);
      return PUSH_RESULT.UNEXPECTED_ERROR;
    }
  }, [profile]);

  // Both halves in order, for a caller already inside a gesture that has no
  // reason to hold them apart: the crop follow, the merchant welcome card, and
  // the diagnostics button. Resolves to one of PUSH_RESULT and never throws.
  // Existing callers ignore the return value and are unaffected by it.
  const promptForPush = useCallback(async () => {
    const outcome = await requestPushPermission();
    if (outcome !== PUSH_RESULT.PERMISSION_GRANTED) return outcome;
    return savePushSubscription();
  }, [requestPushPermission, savePushSubscription]);

  return { promptForPush, requestPushPermission, savePushSubscription };
}

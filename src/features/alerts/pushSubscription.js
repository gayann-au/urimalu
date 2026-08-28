import { supabase } from "../../lib/supabase";

// The web push core: everything that talks to the browser's push APIs and to
// the push_subscriptions table, and nothing that knows who is signed in.
//
// WHY THIS FILE IS SEPARATE FROM THE HOOK. useAuth signs a user out, and
// signing out has to hand this device's push subscription back first (see
// releasePushSubscription below for why). usePushRegistration, meanwhile, is a
// React hook and reads the current profile from useAuth. Putting both halves in
// one file made auth and push import each other, which resolved only because
// every binding involved happened to be a hoisted function declaration: add one
// const or one module level call to either side and the cycle would have
// started biting at runtime, in a sign-out path, in production.
//
// So the rule for this file is simple: it must never import from features/auth.
// It takes a userId as an argument when it needs one. usePushRegistration sits
// on top and is the only side that knows about the signed-in user.
//
// Everything here is best-effort and must never break the app: push is a bonus
// on top of the in-app notifications, so every path swallows its errors and
// simply leaves the user on in-app-only.
//
// EVERY EXIT SAYS WHY, TWICE. This code used to end each failure at a bare
// `catch {}` with no logging, and the result was that push registration failed
// for every device for weeks with nothing anywhere to show it. Console warnings
// fixed that for a developer at a desk and fixed nothing at all for a farmer on
// a phone, whose console nobody can read. So every exit now does two things: it
// warns, and it RETURNS A RESULT STRING naming the same reason. The result is
// what the diagnostics screen puts on the phone's own display.

const PROMPTED_FLAG = "urimalu.pushPrompted";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
export const LOG = "[push]";

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
  SUBSCRIPTION_RELEASED: "subscription-released",
  NOTHING_TO_RELEASE: "nothing-to-release",
  RELEASE_DELETE_FAILED: "release-delete-failed",
  NOTHING_DELETED: "nothing-deleted",
  UNSUBSCRIBE_FAILED: "unsubscribe-failed",
  UNEXPECTED_ERROR: "unexpected-error",
});

// Which requirement for web push this browser is missing, or null when it has
// all of them. Silent by design: the diagnostics reader calls this and must not
// spray the console every time the panel refreshes. pushSupported below is the
// noisy wrapper the registration paths use.
export function supportFailure() {
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
export function stop(result) {
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
export function promptedFlagSet() {
  try {
    return !!localStorage.getItem(PROMPTED_FLAG);
  } catch (err) {
    console.warn(`${LOG} could not read the prompted flag, treating it as unset:`, err);
    return false;
  }
}

export function setPromptedFlag() {
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

// Hand this device's push subscription back before the session ends.
//
// THE BUG THIS EXISTS TO FIX. push_subscriptions is unique on endpoint, but its
// RLS policies are scoped by user_id. One phone has one endpoint. So when a
// second account signs in on a device that already registered, the upsert in
// subscribeAndSave resolves to an UPDATE of a row still owned by the first
// account, the UPDATE policy (user_id = auth.uid()) refuses it, and the second
// account is left permanently unreachable with nothing on screen to say so.
// Confirmed on a phone: the merchant registers, the farmer on the same handset
// gets database-save-failed, the merchant registers again. A merchant who also
// farms, or a family sharing one phone, hits this immediately.
//
// The release has two halves and both matter. Deleting the row frees the
// endpoint for whoever signs in next. Unsubscribing makes the browser mint a
// fresh endpoint for that next account rather than handing it the same one back
// and recreating the collision.
//
// MUST BE CALLED WHILE THE SESSION IS STILL LIVE. The DELETE policy is
// user_id = auth.uid(), so after signOut there is no auth.uid() and the row
// cannot be removed by its owner any more.
//
// Never throws, and every exit returns one of PUSH_RESULT. Sign out is not
// allowed to fail because push housekeeping did, but a release that failed on a
// phone still has to be able to say so on that phone's own screen.
export async function releasePushSubscription(userId) {
  try {
    let endpoint = null;
    let subscription = null;

    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg?.pushManager) {
        subscription = await reg.pushManager.getSubscription();
        // Read the endpoint before unsubscribing: it is the key the row is
        // matched on, and it is the one thing the subscription object is good
        // for once it has been torn down.
        if (subscription) endpoint = subscription.endpoint;
      }
    }

    if (!endpoint && !userId) {
      console.warn(`${LOG} nothing to release: no subscription on this device and no user id.`);
      return PUSH_RESULT.NOTHING_TO_RELEASE;
    }

    // Match on the endpoint when this device has one, because that is what the
    // next account collides with. Fall back to user_id when it does not.
    // Either way RLS confines the delete to rows this user owns, so an endpoint
    // belonging to somebody else is left untouched rather than stolen back.
    //
    // THE SELECT IS WHAT MAKES A NO-OP VISIBLE. A delete that matches no row
    // comes back with no error at all, so without the deleted rows in hand a
    // release that freed the endpoint and a release that touched nothing look
    // exactly alike, and the second one is the failure worth knowing about: it
    // is what a row still owned by the previous account looks like from here.
    // created_at is asked for because it is the one harmless column; the
    // endpoint and the keys are never selected. This relies on the select
    // policy on push_subscriptions being user_id = auth.uid(), which is the
    // same policy the diagnostics screen reads its own rows through.
    const { data, error } = endpoint
      ? await supabase
          .from("push_subscriptions")
          .delete()
          .eq("endpoint", endpoint)
          .select("created_at")
      : await supabase
          .from("push_subscriptions")
          .delete()
          .eq("user_id", userId)
          .select("created_at");

    if (error) {
      console.warn(
        `${LOG} could not release the stored subscription, the next account on this device may not receive push:`,
        error.message || error
      );
    }

    const deletedCount = data?.length || 0;
    if (!error && deletedCount === 0) {
      console.warn(
        `${LOG} the release removed no row, so a stored subscription for this device may still belong to another account and the next account to register may be refused.`
      );
    }

    // The unsubscribe failure used to be warned about and then thrown away, and
    // the caller was told the release had succeeded. That is the one failure
    // this device can see for itself afterwards: the browser keeps the endpoint
    // it already has, the diagnostics panel keeps reporting a subscription, and
    // the next account inherits the collision. It is carried out of the block
    // now so the returned string can name it.
    let unsubscribeError = null;
    if (subscription) {
      try {
        await subscription.unsubscribe();
      } catch (err) {
        unsubscribeError = err;
        console.warn(
          `${LOG} could not unsubscribe this browser, the next account on this device may inherit this endpoint:`,
          err
        );
      }
    }

    // Worst news first, so one string always names the most damaging thing that
    // happened: the row is still there and the write failed, the row is still
    // there and nothing said so, or the row went but this browser kept its
    // endpoint.
    if (error) return PUSH_RESULT.RELEASE_DELETE_FAILED;
    if (deletedCount === 0) return PUSH_RESULT.NOTHING_DELETED;
    if (unsubscribeError) return PUSH_RESULT.UNSUBSCRIBE_FAILED;
    return PUSH_RESULT.SUBSCRIPTION_RELEASED;
  } catch (err) {
    console.warn(`${LOG} releasing the subscription failed, sign out continues regardless:`, err);
    return PUSH_RESULT.UNEXPECTED_ERROR;
  }
}

// Subscribe this browser and store the subscription for the given user. Safe to
// call repeatedly: pushManager reuses an existing subscription, and the DB
// upsert is keyed on the endpoint so duplicates never accumulate.
export async function subscribeAndSave(userId) {
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

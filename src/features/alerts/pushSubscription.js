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

// Which user the repair below has already run for during this app start, or
// null when it has not run at all.
//
// MODULE LEVEL, AND NOT REACT STATE, DELIBERATELY. The guard has to outlive
// every mount, unmount and remount in the app: the component that fires the
// repair sits under a Suspense boundary that destroys and re-creates child
// effects whenever a lazy route chunk loads, and StrictMode double-invokes
// every effect in development. React state resets with the component and would
// guard nothing. This does not.
//
// A USER ID, NOT A BOOLEAN, AND THAT DISTINCTION IS THE WHOLE POINT. Two people
// sharing one phone is normal for this app. The first signs out, which deletes
// the row this device held, and the second signs in moments later without the
// page ever reloading. A boolean here would be spent by the first account and
// the second would silently get no push at all until the app was restarted.
// Keyed on the id, the second account is a different value and runs.
//
// releasePushSubscription clears this on its way out, so signing out and back
// in as the SAME person also repairs, rather than being blocked by a guard that
// still holds their own id from before the sign-out.
let reconciledForUserId = null;

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
  SUBSCRIPTION_ALREADY_STORED: "subscription-already-stored",
  ALREADY_RECONCILED: "already-reconciled",
  RECONCILE_READ_FAILED: "reconcile-read-failed",
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
    // Re-arm the repair, first thing, on every path through this function.
    //
    // This is the teardown. Whatever happens below, the subscription this
    // device had is not something the app may go on assuming, so the next
    // signed-in user on this browser has to be allowed to reconcile, including
    // when that user is the same person signing straight back in. Clearing at
    // the top rather than at the end means every early return and every throw
    // still re-arms it.
    reconciledForUserId = null;

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

    // No endpoint means this device holds nothing of its own to hand back, so
    // there is nothing here to delete. It used to fall through to a delete by
    // user_id at this point, which is the bug this guard exists to end. See the
    // block below the query for what that cost.
    if (!endpoint) {
      console.warn(
        `${LOG} nothing to release: this device holds no push subscription of its own.` +
          (userId
            ? " Any rows this user still has belong to their other devices and are deliberately left alone."
            : "")
      );
      return PUSH_RESULT.NOTHING_TO_RELEASE;
    }

    // ONE ENDPOINT, ONE ROW, AND NEVER A ROW THAT IS NOT THIS DEVICE'S.
    //
    // This delete used to fall back to .eq("user_id", userId) whenever the
    // device had no endpoint of its own, which removed every row that user
    // owned. One user with a phone and a tablet, signing out on the phone,
    // silently killed push on the tablet, and nothing on either device said a
    // word about it. Confirmed on real hardware.
    //
    // The fallback is gone. The guard above returns for the no-endpoint case,
    // and the only delete left in this file matches exactly one endpoint: this
    // device's own. RLS still confines it to rows this user owns, so an
    // endpoint belonging to somebody else is left untouched rather than stolen
    // back. Dead rows on other devices are not this function's job; send-push
    // prunes an endpoint when the push service answers 404 or 410, and that is
    // the only other path in the product that may delete one.
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
    const { data, error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
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

// Put this device's push subscription back when it has gone missing, silently
// and in the background.
//
// WHY THIS HAS TO EXIST. Turning notifications on is something a user does
// once, and from their side it should stay done forever. It did not. Four
// separate things take a subscription away and none of them put it back:
// signing out unsubscribes this browser and deletes the row, reinstalling from
// the home screen mints a brand new endpoint and orphans the stored one, a
// browser may rotate an endpoint on its own, and send-push prunes a row the
// moment the push service answers 404 or 410. After any of those the only route
// back was a diagnostics screen reachable by typing /debug/push, which no
// farmer or trader is ever going to find. What actually happened was that
// alerts stopped and nobody could tell why.
//
// IT MAY CREATE A SUBSCRIPTION, AND THAT IS DELIBERATE. Sign out unsubscribes
// the browser, so after signing back in there is no subscription object here to
// store, and a store-only repair would look, find nothing, and leave the user
// with no push. So this hands off to subscribeAndSave, which reuses a live
// subscription when there is one and mints a fresh one when there is not. No
// prompt and no tap is involved anywhere in it: permission is checked first and
// this returns early unless the user has ALREADY granted it, and subscribe()
// needs no user gesture once that is true. The user said yes once; this is
// honouring that answer, not asking it again.
//
// AT MOST ONE READ, AND A WRITE ONLY WHEN SOMETHING IS GENUINELY MISSING. With
// a subscription in hand it costs one scoped select per user per app start and
// nothing else. With no subscription there is no endpoint to look up, so it
// skips the read entirely and goes straight to the save.
//
// IT DELETES NOTHING, in any branch. A row it cannot see belongs to another
// device or another account, and neither is this function's business.
//
// Never throws. Every exit returns one of PUSH_RESULT.
export async function reconcilePushSubscription(userId) {
  try {
    if (!userId) return PUSH_RESULT.NO_PROFILE;

    // THE GUARD IS SET BEFORE THE FIRST await, ALWAYS. Every line above this
    // one is synchronous, so two effects firing in the same tick, which is
    // precisely what StrictMode does in development, cannot both get past it.
    // Move this below an await and the repair runs twice.
    if (reconciledForUserId === userId) return PUSH_RESULT.ALREADY_RECONCILED;
    reconciledForUserId = userId;

    const failure = supportFailure();
    if (failure) return failure;

    // Not granted means there is nothing to repair and nothing to ask here: the
    // enable card does the asking, inside a real user gesture. It returns
    // quietly rather than through stop(), because this runs on every app start
    // and would otherwise warn once per launch for every user who has never
    // turned alerts on.
    if (Notification.permission !== "granted") return PUSH_RESULT.PERMISSION_NOT_GRANTED;

    const reg = await navigator.serviceWorker.getRegistration();
    // No service worker, so nothing here could receive a push anyway. This is
    // also the normal state under the dev server, where the worker is
    // registered in production builds only.
    if (!reg) return PUSH_RESULT.NO_SERVICE_WORKER_REGISTRATION;

    const existing = reg.pushManager ? await reg.pushManager.getSubscription() : null;

    // No subscription on this browser at all, which is exactly what a sign-out
    // leaves behind. There is no endpoint to look anything up by, so the read
    // is skipped and subscribeAndSave creates one and stores it in one step.
    if (!existing) return await subscribeAndSave(userId);

    // THE ONE READ. Scoped to this user and this exact endpoint, so the answer
    // is a straight yes or no to "is this device already stored against me".
    // created_at is asked for because it is the one harmless column: the
    // endpoint and the keys are never selected back out.
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("created_at")
      .eq("user_id", userId)
      .eq("endpoint", existing.endpoint)
      .maybeSingle();

    if (error) {
      console.warn(
        `${LOG} could not check whether this device is still stored, so it is left alone rather than guessed at:`,
        error.message || error
      );
      return PUSH_RESULT.RECONCILE_READ_FAILED;
    }

    // Already stored. The overwhelmingly common case, and it costs one read.
    if (data) return PUSH_RESULT.SUBSCRIPTION_ALREADY_STORED;

    // The row is gone but the browser still holds the subscription, which is
    // what a prune or a manual delete leaves behind. Store it again.
    //
    // This is the one write, and it can still fail honestly: if this endpoint
    // is stored under a DIFFERENT account, the select policy hid that row from
    // the read above, so the upsert resolves to an update of somebody else's
    // row and RLS refuses it. subscribeAndSave names that as
    // database-save-failed rather than reporting a success.
    return await subscribeAndSave(userId);
  } catch (err) {
    console.warn(`${LOG} the subscription check failed and this device may not receive push:`, err);
    return PUSH_RESULT.UNEXPECTED_ERROR;
  }
}

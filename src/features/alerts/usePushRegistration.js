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
// EVERY EXIT SAYS WHY, OUT LOUD. This file used to end each failure at a bare
// `catch {}` with no logging, and the result was that push registration failed
// for every device for weeks with nothing anywhere to show it. Silence is
// still the right behaviour for the user, who must never see an error from
// here, but it is the wrong behaviour for the console: a warning naming the
// exact reason is the only way anyone finds out this stopped working. Warn,
// never throw.

const PROMPTED_FLAG = "urimalu.pushPrompted";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const LOG = "[push]";

// True only when this browser can actually do web push and we have a key.
// Logs which of the four requirements is missing, because "push not supported"
// on its own does not tell you whether the browser is old or the deploy is
// missing its VAPID key.
function pushSupported() {
  if (typeof window === "undefined") {
    console.warn(`${LOG} not registering: no window (server-side render).`);
    return false;
  }
  if (!("Notification" in window)) {
    console.warn(`${LOG} not registering: push not supported, this browser has no Notification API.`);
    return false;
  }
  if (!("serviceWorker" in navigator)) {
    console.warn(`${LOG} not registering: push not supported, this browser has no service worker support.`);
    return false;
  }
  if (!("PushManager" in window)) {
    console.warn(`${LOG} not registering: push not supported, this browser has no PushManager.`);
    return false;
  }
  if (!VAPID_PUBLIC_KEY) {
    console.warn(`${LOG} not registering: VITE_VAPID_PUBLIC_KEY is not set in this build.`);
    return false;
  }
  return true;
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

// Subscribe this browser and store the subscription for the given user. Safe to
// call repeatedly: pushManager reuses an existing subscription, and the DB
// upsert is keyed on the endpoint so duplicates never accumulate.
async function subscribeAndSave(userId) {
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) {
    // No service worker (for example the dev server): nothing to subscribe to.
    console.warn(`${LOG} not registering: no service worker registration on this page.`);
    return;
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
      `${LOG} supabase upsert into push_subscriptions failed, this device will not receive push:`,
      error.message || error
    );
  }
}

export function usePushRegistration() {
  const { profile } = useAuth();

  // Called right after a user action that has just been saved: a crop follow,
  // or a merchant listing write. Resolves quietly no matter what; callers do
  // not await a result and never see an error from here.
  const promptForPush = useCallback(async () => {
    try {
      if (!profile) {
        console.warn(`${LOG} not registering: no profile, nobody to attach the subscription to.`);
        return;
      }
      if (!pushSupported()) return; // pushSupported already named the reason.

      const permission = Notification.permission;

      // Already decided against it: respect that, never nag again.
      if (permission === "denied") {
        console.warn(`${LOG} not registering: notification permission was already denied on this browser.`);
        return;
      }

      // Already granted: make sure this browser is subscribed (for example a
      // returning user on a new device) and stop.
      if (permission === "granted") {
        await subscribeAndSave(profile.id);
        return;
      }

      // permission === "default": ask exactly once, ever, on this browser.
      if (localStorage.getItem(PROMPTED_FLAG)) {
        console.warn(`${LOG} not registering: already prompted flag is set, this browser was asked once before.`);
        return;
      }

      // THE FLAG IS WRITTEN AFTER THE ANSWER, NEVER BEFORE IT.
      //
      // requestPermission needs a live user gesture, and the merchant path
      // calls this after awaiting a listing write, so the gesture can have
      // expired by the time we get here and the browser rejects the call
      // outright. Setting the flag first meant that rejection burned the one
      // shot: the merchant was marked as asked, no prompt had appeared, and
      // nothing would ever ask again on that device. A throw now leaves the
      // flag unset so the next saved listing can try again.
      let result;
      try {
        result = await Notification.requestPermission();
      } catch (err) {
        console.warn(
          `${LOG} not registering: the browser refused the permission request, most likely because the user gesture had already expired. Leaving the prompted flag unset so a later attempt can still ask:`,
          err
        );
        return;
      }
      localStorage.setItem(PROMPTED_FLAG, "1");

      if (result === "granted") {
        await subscribeAndSave(profile.id);
        return;
      }
      // Denied or dismissed: do nothing. In-app notifications keep working.
      if (result === "denied") {
        console.warn(`${LOG} not registering: the user denied the permission prompt.`);
      } else {
        console.warn(`${LOG} not registering: the user dismissed the permission prompt without choosing.`);
      }
    } catch (err) {
      // Any failure (unsupported API, blocked SW, network) leaves the user on
      // in-app notifications only, with no visible error. It does not leave the
      // console empty any more.
      console.warn(`${LOG} registration failed and this device will not receive push:`, err);
    }
  }, [profile]);

  return { promptForPush };
}

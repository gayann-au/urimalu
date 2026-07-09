import { useCallback } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/useAuth";

// Web push registration. Everything here is best-effort and must never break
// the app: push is a bonus on top of the in-app notifications, so every path
// swallows its errors and simply leaves the user on in-app-only.
//
// The permission prompt is triggered from a crop follow (see FollowCropButton),
// never on page load, and only once: the browser remembers granted/denied, and
// a local flag stops us re-prompting a user who dismissed the prompt without
// choosing (which the browser keeps as "default").

const PROMPTED_FLAG = "urimalu.pushPrompted";
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

// True only when this browser can actually do web push and we have a key.
function pushSupported() {
  return (
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    !!VAPID_PUBLIC_KEY
  );
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
  if (!reg) return; // No service worker (for example the dev server): nothing to do.

  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ||
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    }));

  const json = sub.toJSON(); // { endpoint, keys: { p256dh, auth } }
  await supabase.from("push_subscriptions").upsert(
    { user_id: userId, endpoint: json.endpoint, keys: json.keys },
    { onConflict: "endpoint" }
  );
}

export function usePushRegistration() {
  const { profile } = useAuth();

  // Called right after a crop follow is saved. Resolves quietly no matter what;
  // callers do not await a result and never see an error from here.
  const promptAfterFollow = useCallback(async () => {
    try {
      if (!profile || !pushSupported()) return;

      const permission = Notification.permission;

      // Already decided against it: respect that, never nag again.
      if (permission === "denied") return;

      // Already granted: make sure this browser is subscribed (for example a
      // returning user on a new device) and stop.
      if (permission === "granted") {
        await subscribeAndSave(profile.id);
        return;
      }

      // permission === "default": ask exactly once, ever, on this browser.
      if (localStorage.getItem(PROMPTED_FLAG)) return;
      localStorage.setItem(PROMPTED_FLAG, "1");

      const result = await Notification.requestPermission();
      if (result === "granted") {
        await subscribeAndSave(profile.id);
      }
      // Denied or dismissed: do nothing. In-app notifications keep working.
    } catch {
      // Any failure (unsupported API, blocked SW, network) leaves the user on
      // in-app notifications only, with no visible error.
    }
  }, [profile]);

  return { promptAfterFollow };
}

import { useCallback } from "react";
import { useAuth } from "../auth/useAuth";
import {
  LOG,
  PUSH_RESULT,
  promptedFlagSet,
  setPromptedFlag,
  stop,
  subscribeAndSave,
  supportFailure,
} from "./pushSubscription";

// The React half of web push: the signed-in profile, and the calls a screen
// makes to register this device against it.
//
// The browser and database work lives in ./pushSubscription, which imports no
// auth code at all. That split is deliberate. useAuth has to release this
// device's push subscription during sign-out, so it imports from that module;
// if the release still lived here, auth and push would import each other. That
// cycle did in fact exist, and resolved only because every binding on both
// sides happened to be a hoisted function declaration. One const, or one module
// level call, on either side would have turned it into a runtime failure in the
// sign-out path. Nothing in ./pushSubscription may import from features/auth.
//
// The permission prompt is triggered from a real user action (a crop follow for
// farmers, a saved listing or the approval welcome card for merchants), never
// on page load, and only once: the browser remembers granted/denied, and a
// local flag stops us re-prompting a user who dismissed the prompt without
// choosing (which the browser keeps as "default").
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

// Re-exported for the screens that already read them from this module: the
// follow button and the merchant dashboard take PUSH_RESULT, the diagnostics
// page takes the other two. Their real home is ./pushSubscription.
export { PUSH_RESULT };
export { readPushDiagnostics, clearPromptedFlag } from "./pushSubscription";

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

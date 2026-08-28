import { useCallback, useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../auth/useAuth";
import {
  usePushRegistration,
  readPushDiagnostics,
  clearPromptedFlag,
} from "./usePushRegistration";
import { releasePushSubscription, PUSH_RESULT } from "./pushSubscription";

// PUSH DIAGNOSTICS. Reachable only by typing /debug/push. Linked from nothing.
//
// Push works on a desktop browser and has never registered from a phone, and
// the console of a farmer's phone in Kodagu is not something anyone here can
// read. So the reasons have to come out on the screen of the device that is
// failing. Every line below is a fact this device can state about itself, and
// the button is the one thing a console cannot do for us: fire the permission
// request inside a real finger tap.
//
// ENGLISH ONLY, AND NOT TRANSLATED ON PURPOSE. This is an engineering readout,
// not a farmer-facing screen. It carries no i18n keys, so nothing here can end
// up in the app's real vocabulary by accident.
//
// NOTHING SECRET IS RENDERED. The VAPID key shows as a yes or no, the push
// endpoint shows as a hostname, and the subscription keys are never read.
// readPushDiagnostics enforces that at the source, and the row query below asks
// for created_at alone, so this page could not print them even if it tried.
export default function PushDiagnosticsPage() {
  const { profile } = useAuth();
  const { promptForPush } = usePushRegistration();

  const [diagnostics, setDiagnostics] = useState(null);
  const [subscriptionRows, setSubscriptionRows] = useState(null);
  const [rowsError, setRowsError] = useState(null);
  const [lastResult, setLastResult] = useState("not run yet");
  const [flagNote, setFlagNote] = useState(null);

  const loadDiagnostics = useCallback(async () => {
    setDiagnostics(await readPushDiagnostics());
  }, []);

  // This user's own rows in push_subscriptions. The select policy on that table
  // is user_id = auth.uid(), so a signed-in reader sees their own and nothing
  // else. created_at is the only column asked for: the endpoint and the keys
  // are not selected, so they never travel to this page.
  const loadSubscriptionRows = useCallback(async () => {
    if (!profile) {
      setSubscriptionRows(null);
      return;
    }
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("created_at")
      .eq("user_id", profile.id)
      .order("created_at", { ascending: false });
    if (error) {
      setRowsError(error.message || String(error));
      setSubscriptionRows(null);
      return;
    }
    setRowsError(null);
    setSubscriptionRows(data || []);
  }, [profile]);

  useEffect(() => {
    loadDiagnostics();
    loadSubscriptionRows();
  }, [loadDiagnostics, loadSubscriptionRows]);

  // THE WHOLE POINT OF THIS BUTTON.
  //
  // promptForPush is called on the very first line, with nothing awaited in
  // front of it, so the browser still sees a live user gesture when the
  // permission request goes out. Android and iOS both refuse the request
  // outright without one. Everything else in this handler runs after that call
  // has already been made.
  function onEnableNotifications() {
    const running = promptForPush();
    setLastResult("asking...");
    running.then((result) => {
      setLastResult(result);
      loadDiagnostics();
      loadSubscriptionRows();
    });
  }

  // A notification drawn straight by the service worker, with the push service
  // taken out of the loop entirely. That is the whole value of it: if this
  // shows something on the phone but a real push never lands, the problem is
  // delivery; if this shows nothing either, the problem is on the device and
  // no amount of server work will fix it.
  async function onShowTestNotification() {
    setLastResult("showing...");
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (!reg) {
        setLastResult("no-service-worker-registration");
        return;
      }
      await reg.showNotification("Test", {
        body: "Local test notification",
        icon: "/icons/icon-192.png",
        data: { url: "/notifications" },
      });
      setLastResult("shown");
    } catch (err) {
      setLastResult(err?.message || String(err));
    }
  }

  // The release, run on its own, with its answer on the screen.
  //
  // Sign out calls this too, but it calls it on the way past and discards what
  // it returns, so a release that did nothing left no trace on the one device
  // that could report it. Confirmed on a phone: sign out as one account, sign
  // in as another, and the stored row still carried the first account's user id
  // while this panel still showed a subscription on the same endpoint host.
  // Here the release is the whole action and its PUSH_RESULT lands on the
  // Result line above, so "it never ran" and "it ran and failed" stop looking
  // the same from the outside.
  //
  // releasePushSubscription never throws, so there is nothing to catch.
  async function onReleaseSubscription() {
    if (!profile) {
      setLastResult(PUSH_RESULT.NO_PROFILE);
      return;
    }
    setLastResult("releasing...");
    const result = await releasePushSubscription(profile.id);
    setLastResult(result);
    loadDiagnostics();
    loadSubscriptionRows();
  }

  function onResetFlag() {
    const cleared = clearPromptedFlag();
    setFlagNote(cleared ? "Prompted flag removed." : "Could not remove the prompted flag.");
    loadDiagnostics();
  }

  return (
    <div className="w-full max-w-md mx-auto px-4 py-8">
      <h1 className="font-display text-xl font-extrabold tracking-tight text-ink-900">
        Push diagnostics
      </h1>
      <p className="text-xs text-ink-500 mt-1">
        Engineering readout. Not linked from anywhere in the app.
      </p>

      <div className="mt-5">
        <button
          type="button"
          onClick={onEnableNotifications}
          className="w-full min-h-[48px] rounded-[14px] bg-coorg-600 text-white font-bold text-sm hover:bg-coorg-700 transition-colors"
        >
          Enable notifications
        </button>
        <button
          type="button"
          onClick={onShowTestNotification}
          className="w-full min-h-[48px] mt-2 rounded-[14px] border-2 border-ink-200 bg-white text-ink-700 font-bold text-sm hover:border-coorg-300 transition-colors"
        >
          Show test notification
        </button>
        <button
          type="button"
          onClick={onReleaseSubscription}
          className="w-full min-h-[48px] mt-2 rounded-[14px] border-2 border-ink-200 bg-white text-ink-700 font-bold text-sm hover:border-coorg-300 transition-colors"
        >
          Release subscription
        </button>
        <button
          type="button"
          onClick={onResetFlag}
          className="w-full min-h-[48px] mt-2 rounded-[14px] border-2 border-ink-200 bg-white text-ink-700 font-bold text-sm hover:border-coorg-300 transition-colors"
        >
          Reset prompted flag
        </button>
      </div>

      <Section title="Last attempt">
        <Line label="Result" value={lastResult}/>
        {flagNote && <Line label="Flag" value={flagNote}/>}
      </Section>

      <Section title="This browser">
        {diagnostics === null ? (
          <p className="text-xs text-ink-500 py-2">Reading...</p>
        ) : (
          <>
            <Line label="window" value={diagnostics.hasWindow}/>
            <Line label="Notification API" value={diagnostics.hasNotification}/>
            <Line label="serviceWorker support" value={diagnostics.hasServiceWorker}/>
            <Line label="PushManager" value={diagnostics.hasPushManager}/>
            <Line label="VAPID key present in build" value={diagnostics.hasVapidKey}/>
            <Line label="Notification.permission" value={diagnostics.permission}/>
            <Line label="Service worker registered" value={diagnostics.hasServiceWorkerRegistration}/>
            <Line label="Push subscription on device" value={diagnostics.hasPushSubscription}/>
            <Line label="Push endpoint host" value={diagnostics.pushEndpointHost}/>
            <Line label="Prompted flag set" value={diagnostics.promptedFlagSet}/>
            {diagnostics.readError && <Line label="Read error" value={diagnostics.readError}/>}
          </>
        )}
      </Section>

      <Section title="Stored subscriptions for this account">
        {!profile ? (
          <p className="text-xs text-ink-500 py-2">
            Not signed in, so the stored rows cannot be read.
          </p>
        ) : rowsError ? (
          <Line label="Read error" value={rowsError}/>
        ) : subscriptionRows === null ? (
          <p className="text-xs text-ink-500 py-2">Reading...</p>
        ) : (
          <>
            <Line label="Row count" value={subscriptionRows.length}/>
            {subscriptionRows.map((row, i) => (
              <Line key={`${row.created_at}-${i}`} label="created_at" value={row.created_at}/>
            ))}
          </>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h2 className="text-xs font-bold uppercase tracking-wide text-ink-500">{title}</h2>
      <div className="mt-2 bg-white rounded-2xl border border-ink-200 px-4">{children}</div>
    </section>
  );
}

// One labelled fact. Booleans print as true and false rather than as a tick or
// a colour, because a diagnosis gets read aloud down a phone line as often as
// it gets looked at, and "false" survives that where a grey icon does not. A
// missing value prints as null for the same reason: a blank row would read as a
// bug in this page rather than as an answer.
function Line({ label, value }) {
  const text = value === null || value === undefined ? "null" : String(value);
  return (
    <div className="flex items-start justify-between gap-3 py-2 border-b border-ink-100">
      <span className="text-xs text-ink-500">{label}</span>
      <span className="text-xs font-semibold text-ink-900 text-right break-words">{text}</span>
    </div>
  );
}

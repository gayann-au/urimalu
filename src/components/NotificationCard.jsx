import { useState } from "react";
import { motion } from "framer-motion";
import { useAuth } from "../features/auth/useAuth";
import { usePushRegistration, clearPromptedFlag } from "../features/alerts/usePushRegistration";
import { supportFailure } from "../features/alerts/pushSubscription";
import { getPlatform, isStandalone } from "../lib/installEnvironment";
import { useUriMotion } from "../lib/uiMotion";

// The always-there way to turn phone alerts on.
//
// WHY IT EXISTS. Every other ask in the app is tied to a moment: following a
// crop, saving a price, the merchant welcome card. Each of those fires once and
// then never again, because the browser gives one permission prompt per device
// and a local flag stops us asking a second time unbidden. Anyone who was busy
// at that moment, or who tapped past it, has nowhere in the product to change
// their mind afterwards. This card is that place.
//
// It is inline: a normal block in the document flow, like InstallCard, whose
// shape and classes it borrows so the two cards read as one family. No fixed
// positioning, no backdrop, no portal, nothing to dismiss.
//
// AND IT MUST STAY INLINE, ON EVERY PAGE IT IS ADDED TO. It stands on the feed,
// the merchant dashboard and the notifications page, which is reach enough.
// Turning it into a popup, a modal or an overlay to lift that reach further
// would spend the one thing that cannot be spent twice: the browser allows a
// single permission prompt per device, a dismissal is remembered, and on an
// iPhone that dismissal is effectively permanent. Interrupting somebody three
// times does not raise the odds of a yes, it just picks the worst of the three
// moments to ask in. Meeting the same quiet card in several places is how this
// gets its reach without spending that one prompt.
//
// IT IS HONEST ABOUT THE DENIED CASE. Once a browser has recorded a denial no
// web API can reopen the prompt, and no web API can open device settings from
// a page. A button there would do nothing at all when tapped, so there is no
// button there: the steps take its place. The same rule hides the whole card on
// a browser that cannot do push, rather than offering something that would fail
// silently on the far side of the tap.
//
// ENGLISH ONLY, AS LITERALS, ON PURPOSE. The rest of the app reads its words
// from i18n, but no Kannada is written for this copy yet, and an English string
// filed under the English key alone would sit in the shared vocabulary looking
// translated while still rendering as English for a Kannada reader. The
// literals stay here until both languages exist, and then both land together.

// The same switch, with the reason each side of the market actually has for
// flipping it.
//
// A farmer is waiting to hear what a merchant will pay. A merchant is waiting
// to hear that a farmer has crop ready to sell. Telling a merchant that
// merchants post rates describes their own working day back at them and offers
// them nothing, which is how one card ends up earning its place on one side of
// a marketplace and being scrolled past on the other.
//
// Roles are the uppercase strings the users table stores, compared here the
// same way the header, the account page and the route guards compare them.
const ROLE_COPY = {
  FARMER: {
    heading: "Know the price before you sell",
    body: "Turn on alerts and your phone tells you the moment a merchant posts a new rate. No opening the app to check.",
  },
  MERCHANT: {
    heading: "Reach the farmer first",
    body: "Turn on alerts and your phone tells you the moment a farmer posts crop ready to sell. The first merchant to call usually gets the deal.",
  },
};

// The farmer wording is the fallback: for an admin, for a profile that has not
// arrived yet, and for any role added to the database ahead of this file. It is
// the safe default because it assumes nothing about running a business, and
// because a farmer is who most readers of this card are.
function copyForRole(role) {
  return ROLE_COPY[role] || ROLE_COPY.FARMER;
}

// The one true line for this device.
//
// No role anywhere in here, and there should never be one: this is about where
// a switch lives in the phone's own settings, and the phone has never heard of
// farmers or merchants. Both roles read the identical steps.
//
// The two paths are genuinely different places. An app opened from the home
// screen keeps its notification switch with the phone's other apps; a page open
// in a browser keeps it with that browser's settings for this site, and the
// phone's app list has nothing in it to find. Sending someone to a list their
// app is not in is the same dishonesty as a button that does nothing.
//
// On an iPhone only the first case can reach here at all: push does not exist
// in a browser tab there, so the support check has already hidden this card.
function deniedInstruction(platform, standalone) {
  if (platform === "ios") {
    return "Open your phone's Settings, find Urimalu in the list, and turn Notifications on.";
  }
  if (platform === "android" && standalone) {
    return "Open your phone's Settings, go to Apps, find Urimalu, and turn Notifications on.";
  }
  return "Open the site settings for this page in your browser and turn Notifications on.";
}

// What this browser says right now, or null when push cannot work here at all.
// The support check runs first because Notification.permission is not there to
// be read on a browser without the API.
function readPermission() {
  if (supportFailure()) return null;
  return Notification.permission;
}

export function NotificationCard({ className = "" }) {
  const m = useUriMotion();
  const { profile } = useAuth();
  const { promptForPush } = usePushRegistration();

  // Held in state rather than read at render, so the card can answer the tap it
  // just handled. Permission changes nothing else on this page, so there is no
  // other render to ride on: without this, a card that had just been granted
  // would sit there offering to do the thing it had already done until the
  // next full page load.
  const [permission, setPermission] = useState(readPermission);

  // Push cannot work on this browser, so there is nothing to offer.
  if (permission === null) return null;
  // Already on. Nothing to ask for, and nothing worth saying about it.
  if (permission === "granted") return null;

  const denied = permission === "denied";
  const copy = copyForRole(profile?.role);

  // THE GESTURE, AND WHAT MUST NOT GO IN FRONT OF IT.
  //
  // promptForPush is reached on the second line of this handler with nothing
  // awaited in front of it, so the browser still sees a live user gesture when
  // the permission request goes out. Both phone platforms refuse the request
  // outright without one. Everything that needs the network happens inside the
  // then, after the ask has already been made.
  function onEnable() {
    // The one-shot flag is what stops the moment based asks from nagging
    // someone who dismissed the prompt without choosing. A finger on this
    // button is not us nagging, it is the user asking for exactly this, so the
    // flag is cleared here and nowhere else in the app. The hook writes it
    // straight back as soon as the browser returns an answer, so the moment
    // based asks are left behaving exactly as they did. localStorage is
    // synchronous, so the gesture survives this line.
    clearPromptedFlag();
    const running = promptForPush();
    // promptForPush never throws and never prompts twice; re-reading the
    // permission is all this needs, and it is what makes the card disappear on
    // a grant and switch to the steps on a denial, with no reload either way.
    running.then(() => setPermission(readPermission()));
  }

  return (
    <motion.section
      variants={m.fadeUp}
      initial="hidden"
      animate="show"
      className={`rounded-2xl border border-ink-200 bg-white shadow-sm px-5 py-4 text-left ${className}`}
    >
      <p className="font-display font-extrabold text-sm text-ink-900">
        {copy.heading}
      </p>

      {denied ? (
        <>
          <p className="mt-1 text-[13px] leading-snug text-ink-600">
            Alerts are switched off for Urimalu on this phone.
          </p>
          <p className="mt-2 text-[13px] leading-snug text-ink-600">
            {deniedInstruction(getPlatform(), isStandalone())}
          </p>
        </>
      ) : (
        <>
          <p className="mt-1 text-[13px] leading-snug text-ink-600">
            {copy.body}
          </p>
          <motion.button
            type="button"
            onClick={onEnable}
            whileTap={m.btnTap}
            className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-[14px] bg-chilli-600 px-5 text-sm font-bold text-white transition-colors hover:bg-chilli-700"
          >
            Turn on alerts
          </motion.button>
        </>
      )}
    </motion.section>
  );
}

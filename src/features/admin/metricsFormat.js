import { format } from "date-fns";

// Pure formatting for the admin metrics page. No JSX, no Tailwind, no React.
//
// Everything here answers one of two questions: what does this number look like
// to a person, and what do we call this thing on screen. Colour and layout are
// the page's business, so quietness below returns a tone name rather than a
// class string.
//
// ENGLISH ONLY BY DESIGN. The metrics page is an operator's console read by one
// person and carries no i18n keys, so nothing in here can leak into the app's
// Kannada vocabulary.

// Days without a confirmed price before a merchant counts as gone quiet, and
// the earlier point at which they are worth watching. QUIET_DAYS is not just a
// colour threshold: it is the line the page groups merchants on.
export const QUIET_DAYS = 7;
export const WATCH_DAYS = 3;

// The words a null renders as. Null means "could not be counted", never zero,
// and it has to read as words so it can never be mistaken for a figure.
export const NOT_AVAILABLE = "Not available";

export function formatCount(n) {
  return new Intl.NumberFormat("en-IN").format(n);
}

export function isMissing(value) {
  return value === null || value === undefined;
}

export function formatDate(iso) {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "d MMM yyyy");
}

export function formatShortDate(iso) {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "d MMM");
}

export function formatDateTime(iso) {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "d MMM yyyy, h:mm a");
}

// A share of a total, never rounded down to a bare 0% for something that did
// happen. A row reading "1" next to "0%" makes a reader distrust the whole
// table, and rightly so.
export function percentLabel(count, total) {
  if (!total || count <= 0) return "0%";
  const pct = (count / total) * 100;
  if (pct < 1) return "<1%";
  return `${Math.round(pct)}%`;
}

// Turn a raw database value into something readable, for the case where a type
// appears that this file has never heard of.
//
// This exists because the breakdown is now driven by whatever the database
// actually contains, which is the fix for price_confirmed silently vanishing.
// The flip side of that fix is that an unknown key can now reach the screen, and
// a founder should never be shown a bare enum value, so it gets sentence case
// and its underscores taken out rather than being printed raw.
export function humaniseKey(key) {
  const words = String(key).replace(/_/g, " ").trim();
  if (!words) return "Other";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

// What each notification type is called on screen, in the reader's language
// rather than the database's. price_confirmed is here because it is now the
// overwhelming majority of everything created, and was previously counted by
// nothing at all.
const NOTIFICATION_LABELS = {
  price_confirmed: "Price confirmations",
  price_alert: "Price changes",
  seller_lead: "Ready to sell posts",
  seller_lead_response: "Merchant replies",
  merchant_approved: "Merchant approved",
  merchant_rejected: "Merchant rejected",
  price_reminder: "Reminders to merchants",
};

export function notificationLabel(key) {
  return NOTIFICATION_LABELS[key] || humaniseKey(key);
}

const ASSISTANT_SOURCE_LABELS = {
  smalltalk: "Small talk",
  blocked: "Blocked before answering",
  data: "Answered from app data",
  general: "General answer",
  knowledge: "Answered from knowledge",
  outside: "Outside what it covers",
  error: "Failed with an error",
};

export function assistantSourceLabel(key) {
  return ASSISTANT_SOURCE_LABELS[key] || humaniseKey(key);
}

// How long a merchant has been silent, as a tone, a short badge and a sentence.
//
// daysSinceConfirmed is null when a merchant has never confirmed a price at
// all. That is the loudest case on the page and gets its own tone rather than
// being folded in with zero days, which means the opposite.
export function quietness(days) {
  if (isMissing(days)) {
    return { tone: "never", badge: "never", headline: "Never confirmed a price" };
  }
  if (days >= QUIET_DAYS) {
    return { tone: "chase", badge: `${days}d`, headline: `Quiet for ${formatCount(days)} days` };
  }
  if (days >= WATCH_DAYS) {
    return { tone: "watch", badge: `${days}d`, headline: `Quiet for ${formatCount(days)} days` };
  }
  if (days <= 0) {
    return { tone: "fresh", badge: "today", headline: "Confirmed today" };
  }
  if (days === 1) {
    return { tone: "fresh", badge: "1d", headline: "Confirmed yesterday" };
  }
  return { tone: "fresh", badge: `${days}d`, headline: `Confirmed ${formatCount(days)} days ago` };
}

// The grouping the page opens with. A merchant is quiet if they have never
// confirmed a price, or have not confirmed one for a week.
export function isQuietMerchant(merchant) {
  const days = merchant?.daysSinceConfirmed;
  return isMissing(days) || days >= QUIET_DAYS;
}

// Sort a { key: count } object into rows, biggest first, with a total.
//
// Biggest first because the reader wants to know what dominates, and because
// the chart's colours are assigned by rank, so the same series keeps the same
// colour between the bar and the legend.
export function rankedEntries(record) {
  if (!record) return null;
  const entries = Object.entries(record)
    .filter(([, count]) => typeof count === "number")
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count);
  const total = entries.reduce((sum, e) => sum + e.count, 0);
  return { entries, total };
}

// Shared freshness helper for the farmer-facing crop cards.
//
// Pure and locale agnostic: given the confirmed timestamp it returns a
// translation key, its params, and a severity. The UI calls t(key, params)
// and picks an icon plus colour from the severity. Keeping this in one place
// means the by-crop card and the merchant profile listing read identically.
//
// Severity bands:
//   fresh    under 6 hours
//   aging    6 to 23 hours, or no timestamp
//   overdue  1 to 2 days
//   stale    more than 2 days
export function freshnessStatus(confirmedAt, now = Date.now()) {
  if (!confirmedAt) {
    return { key: "freshness.notConfirmed", params: {}, severity: "aging" };
  }
  const ts = Date.parse(confirmedAt);
  if (Number.isNaN(ts)) {
    return { key: "freshness.notConfirmed", params: {}, severity: "aging" };
  }

  const diff = Math.max(0, now - ts);
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) {
    const n = Math.max(1, minutes);
    return {
      key: n === 1 ? "freshness.minuteAgo" : "freshness.minutesAgo",
      params: { count: n },
      severity: "fresh",
    };
  }
  if (hours <= 5) {
    return {
      key: hours === 1 ? "freshness.hourAgo" : "freshness.hoursAgo",
      params: { count: hours },
      severity: "fresh",
    };
  }
  if (hours <= 23) {
    return {
      key: hours === 1 ? "freshness.hourAgo" : "freshness.hoursAgo",
      params: { count: hours },
      severity: "aging",
    };
  }
  if (days <= 2) {
    return {
      key: days === 1 ? "freshness.dayAgo" : "freshness.daysAgo",
      params: { count: days },
      severity: "overdue",
    };
  }
  return {
    key: "freshness.daysAgoConfirm",
    params: { count: days },
    severity: "stale",
  };
}

// Past this many days a merchant listing stops showing its price at all.
//
// The same week-long standard the market rates board already applies to a mandi
// row, MANDI_MAX_AGE_DAYS in src/features/market/MandiFreshness.jsx: a price
// this old is not useful and a farmer could act on it, so the figure is
// withdrawn rather than dressed with a caveat. More than seven days is strictly
// greater, so a listing on its seventh day still shows its price.
//
// Counted in elapsed days from confirmed_at, the same arithmetic
// freshnessStatus above already uses, and deliberately NOT with dataAge.js.
// That helper reduces its input to a YYYY-MM-DD calendar day, which is right
// for source_date (a date column) and wrong for confirmed_at (an instant, whose
// stored ISO prefix is its UTC day and can name yesterday for an early morning
// IST confirmation).
export const LISTING_MAX_AGE_DAYS = 7;

// Whether a listing is past the cutoff and must not show its price.
//
// A listing with no usable confirmed_at returns false. freshnessStatus already
// labels that case "Not confirmed yet" on the same card, and withholding the
// price as well would be a second, quieter rule for a case that line covers.
export function isListingPriceTooOld(confirmedAt, now = Date.now()) {
  if (!confirmedAt) return false;
  const ts = Date.parse(confirmedAt);
  if (Number.isNaN(ts)) return false;
  const days = Math.floor(Math.max(0, now - ts) / 86400000);
  return days > LISTING_MAX_AGE_DAYS;
}

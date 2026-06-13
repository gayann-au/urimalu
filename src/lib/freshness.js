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

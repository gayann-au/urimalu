// How old a market price is, in calendar days.
//
// Pure and locale agnostic, the same contract as freshness.js: given the
// source's publication date it returns a translation key, its params, and a
// band. The UI calls t(key, params) and picks weight and glyph from the band.
// It is a separate helper from freshness.js on purpose. That one measures
// hours since a merchant confirmed their own listing; this one measures days
// against a third party's publication date, and no band here maps to a colour.
//
// Bands, from the brief:
//   fresh    0 to 2 days
//   ageing   3 to 14 days
//   stale    15 days and over
//
// The day count is always rendered by the caller. The band only selects
// wording and weight, it never replaces the number.
//
// Everything below works in whole local calendar days, never elapsed
// milliseconds. source_date is a date column, so Date.parse("2026-06-16")
// would give UTC midnight, and diffing that against a local now in IST lands
// 47 on 46 or 48 depending on the hour of day. That silent one-off would make
// a stale price look fresher than it is, which is the exact failure this
// feature exists to prevent. So both sides are reduced to a local midnight
// first, reusing the YYYY-MM-DD prefix the way formatValidTill already does.

const MS_PER_DAY = 86400000;

const FRESH_MAX_DAYS = 2;
const AGEING_MAX_DAYS = 14;

// Local midnight for a "YYYY-MM-DD" date or an ISO timestamp sharing that
// prefix. Returns null for anything missing, malformed, or impossible.
// The round trip through the constructor is the impossibility check:
// new Date(2026, 1, 30) rolls silently into 2 March, so "2026-02-30" comes
// back with a different date than it went in with and is rejected.
function localMidnightFromSourceDate(value) {
  if (!value) return null;
  const parts = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!parts) return null;

  const year = Number(parts[1]);
  const month = Number(parts[2]);
  const day = Number(parts[3]);

  const midnight = new Date(year, month - 1, day);
  if (
    midnight.getFullYear() !== year ||
    midnight.getMonth() !== month - 1 ||
    midnight.getDate() !== day
  ) {
    return null;
  }
  return midnight;
}

// Local midnight of the reader's today. Accepts a Date or a timestamp.
function localMidnightFromNow(now) {
  const d = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// Whole calendar days between the source date and today, never negative.
// Returns null when the date is missing or unparseable, so the caller can
// omit the line rather than render an age it cannot stand behind.
//
// Math.round, not floor. Both operands are local midnights, so the gap is a
// whole number of days except across a daylight saving boundary where it is
// 23 or 25 hours, and floor would report the 23 hour case a day short. India
// has no DST so this only reaches a reader who is travelling, but rounding
// costs nothing and removes the case entirely.
export function ageInDays(sourceDate, now = Date.now()) {
  const from = localMidnightFromSourceDate(sourceDate);
  const to = localMidnightFromNow(now);
  if (!from || !to) return null;

  const days = Math.round((to.getTime() - from.getTime()) / MS_PER_DAY);
  // A source date in the future is a bad feed, not a negative age. Clamp to
  // zero so it reads as today rather than as a countdown.
  return Math.max(0, days);
}

// { days, band, key, params } for a source date, or null when there is no
// usable date. An undated row has nothing legitimate to say about its age,
// so the caller omits the line entirely rather than guessing at a band.
export function dataAge(sourceDate, now = Date.now()) {
  const days = ageInDays(sourceDate, now);
  if (days === null) return null;

  let band = "stale";
  if (days <= FRESH_MAX_DAYS) band = "fresh";
  else if (days <= AGEING_MAX_DAYS) band = "ageing";

  let key = "market.ageDays";
  if (days === 0) key = "market.ageToday";
  else if (days === 1) key = "market.ageDay";

  return { days, band, key, params: { count: days } };
}

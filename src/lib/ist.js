// India Standard Time, the one clock the market board reports in.
//
// WHY THIS FILE EXISTS. Every date and time on the market board, the weather
// section and the world benchmarks used to be rendered in the device's own
// timezone. A phone set to another zone therefore showed a misleading hour: a
// fetch that happened at 11:00 in Kodagu read as 05:30 to a reader whose device
// was on UTC, and nothing on screen said which clock it was. A farmer cannot
// check that, so it has to be right, and it has to say so.
//
// IST is UTC+05:30 and India has never observed daylight saving, so the offset
// below is a constant rather than a call into Intl. That is deliberate: a fixed
// offset is exact, needs no ICU data, and cannot vary between two browsers the
// way a formatter can.
//
// NOTHING HERE USES toLocaleTimeString OR toLocaleDateString. A Kannada locale
// can emit a numeral set the rest of this board never uses, and one line of
// Kannada digits beside a column of Latin ones is a number a reader cannot
// compare. Every part is formatted by hand, the same reason formatLongDate in
// constants.js is hand rolled.

// Printed after every time this app shows, so a reader never has to guess which
// clock a figure was taken on. Not translated: IST is the name of the zone in
// both languages, and an invented Kannada rendering would be a second label for
// one fact.
export const IST_LABEL = "IST";

const IST_OFFSET_MINUTES = 330;
const MS_PER_MINUTE = 60000;

// The IST calendar parts of an instant, or null when there is no readable one.
//
// Takes a Date, an epoch millisecond number, or an ISO timestamp string, which
// are the three shapes the callers hold: fetched_at arrives as a timestamptz
// string, the weather hook stamps epoch milliseconds, and Date.now() is used
// for today.
//
// FOR INSTANTS ONLY. It must never be handed a source_date, which is a date
// column with no time in it: shifting "2026-08-04" by five and a half hours
// would move a date that has no clock reading to move. dataAge.js handles those
// by their YYYY-MM-DD prefix and never comes through here.
export function istParts(value) {
  if (value == null || value === "") return null;
  const d = value instanceof Date ? value : new Date(value);
  const ms = d.getTime();
  if (Number.isNaN(ms)) return null;

  // Shift the instant by the offset, then read the UTC parts of the result.
  // Reading UTC parts is what makes this independent of the device: getUTCHours
  // returns the same number on every machine, where getHours does not.
  const shifted = new Date(ms + IST_OFFSET_MINUTES * MS_PER_MINUTE);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

// "YYYY-MM-DD" for a set of IST parts, the shape formatLongDate and every date
// comparison in this app already read.
export function isoDayFromParts(parts) {
  if (!parts) return null;
  const mm = String(parts.month).padStart(2, "0");
  const dd = String(parts.day).padStart(2, "0");
  return `${parts.year}-${mm}-${dd}`;
}

// The IST calendar day an instant fell on, as "YYYY-MM-DD", or null.
export function istIsoDay(value) {
  return isoDayFromParts(istParts(value));
}

// Today's IST calendar day, as "YYYY-MM-DD".
//
// The whole feature counts age in IST calendar days, so this is the single
// definition of what today means on this board. A reader in another timezone
// sees the same today a reader in Kodagu does, which is the only reading that
// makes "today's price is not out yet" a true sentence.
export function istTodayIso(now = Date.now()) {
  return istIsoDay(now);
}

// "11:00 AM IST" for a set of IST parts, or null when there are none.
//
// The zone label is part of the returned string rather than left to the
// translation, so a time cannot reach a screen without it. A key that
// interpolated the label separately could be edited to drop it in one language,
// and nobody would notice until a reader misread an hour.
export function formatIstTime(parts) {
  if (!parts) return null;
  const suffix = parts.hour < 12 ? "AM" : "PM";
  const hour12 = parts.hour % 12 === 0 ? 12 : parts.hour % 12;
  return `${hour12}:${String(parts.minute).padStart(2, "0")} ${suffix} ${IST_LABEL}`;
}

// "11:00 AM IST" straight from an instant, or null when it cannot be read.
export function istTimeText(value) {
  return formatIstTime(istParts(value));
}

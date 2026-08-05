import { useTranslation } from "react-i18next";
import { ageInDays } from "../../lib/dataAge";
import { formatLongDate } from "../../lib/constants";
import { istTimeText } from "../../lib/ist";

// WHY A PRICE FROM YESTERDAY NEEDS A SENTENCE.
//
// A mandi card said "Rate as on 4 August 2026" and nothing else. On 5 August at
// noon a farmer reads that as the app being broken, because the card gives no
// way at all to tell "we are working and today's price is not published yet"
// apart from "this stopped fetching a week ago". Both look identical: an old
// date, sitting there.
//
// The publishing hour moves day to day. On 4 August the Kodagu rows were there
// by 3:32 AM. On 5 August there were none at 10:45 AM. That is ordinary, so the
// lines below say only the two things we actually know: when we looked, and
// what we found.
//
// THE WORDING RULES, held here because this is the only file that writes them.
//   Never blame anyone. Not the government, not a market, not a website.
//   Never say a source is down, broken, delayed, failing or not working.
//   Never speculate about why. We know when we checked and what came back.
//   Make it obvious the app itself is working and did look.
//   No jargon. The reader may not have been to school.
//
// Nothing here is advice and nothing here is a verdict on a price. The text is
// ink-700 and ink-600, the same plain neutrals every other line uses, and no
// colour anywhere says a number is good or bad.

// Past this many IST calendar days the price stops being shown at all.
//
// A week old mandi price is not useful and a farmer could act on it, so the
// figure is withdrawn rather than dressed with a caveat. Counted in IST
// calendar days by ageInDays, never in hours: a price published late on the 4th
// and read early on the 12th is eight days old on the calendar whatever the
// clock says, and the reader counts days.
export const MANDI_MAX_AGE_DAYS = 7;

// Whether a mandi row is past the cutoff and must not show its figure.
//
// More than seven days is strictly greater, so a row on its seventh day still
// shows. An unreadable date returns false rather than true, because such a row
// never reaches a card in the first place: canRenderPrice in MarketPriceRow
// already refuses it. Returning true here would be a second, quieter rule for a
// case that cannot arrive.
export function isMandiPriceTooOld(sourceDate, now = Date.now()) {
  const days = ageInDays(sourceDate, now);
  if (days === null) return false;
  return days > MANDI_MAX_AGE_DAYS;
}

// Whether a row was published on today's IST calendar day.
export function isMandiPriceFromToday(sourceDate, now = Date.now()) {
  return ageInDays(sourceDate, now) === 0;
}

// The freshness line for a mandi card, or nothing when the row is from today.
//
// Three outcomes, and this component picks between them rather than the cards,
// so a pepper card and the arecanut card cannot end up saying it differently:
//
//   published today        no line at all, the date under the price is enough
//   not published yet      when we looked, that today is not out, and the date
//                          of the price actually on screen
//   past the cutoff        no figure is on screen, so this says what the last
//                          date was and that we are still looking
//
// fetchedAt is the moment our job pulled from the source, not the moment this
// rendered. That is the honest reading of "we checked": a card held in the
// query cache for twenty minutes still names the time the data arrived.
//
// The time is dropped, and only the time, when fetched_at is unreadable. The
// rest of the sentence is still true and still worth saying, so it goes out
// without that clause rather than the whole line being lost.
export function MandiAgeNote({ sourceDate, fetchedAt }) {
  const { t } = useTranslation();

  if (isMandiPriceFromToday(sourceDate)) return null;

  const date = formatLongDate(sourceDate);
  if (!date) return null;

  if (isMandiPriceTooOld(sourceDate)) {
    return (
      <p className="mt-1.5 text-sm leading-relaxed text-ink-700">
        {t("market.mandi.age.noNewPrice", { date })}
      </p>
    );
  }

  const time = istTimeText(fetchedAt);
  return (
    <p className="mt-2 text-xs leading-relaxed text-ink-600">
      {time
        ? t("market.mandi.age.notYet", { time, date })
        : t("market.mandi.age.notYetNoTime", { date })}
    </p>
  );
}

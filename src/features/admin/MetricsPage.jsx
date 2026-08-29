import { useMemo, useState } from "react";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { useMetrics } from "./useMetrics";
import {
  NOT_AVAILABLE,
  QUIET_DAYS,
  assistantSourceLabel,
  formatCount,
  formatDate,
  formatDateTime,
  formatShortDate,
  isMissing,
  isQuietMerchant,
  notificationLabel,
  percentLabel,
  quietness,
  rankedEntries,
} from "./metricsFormat";

// The admin metrics page.
//
// WHO READS THIS. One person, on a phone, usually in a hurry, and not an
// analyst. That single fact decides the whole layout, so the page is ordered by
// what a founder needs to act on rather than by which table the number came
// from. The first thing on screen is what has gone wrong. Context comes later,
// and the timestamp and the caveats come last.
//
// ENGLISH ONLY, AND NOT TRANSLATED ON PURPOSE, the same rule the push
// diagnostics screen follows. No i18n keys, so nothing here can leak into the
// app's Kannada vocabulary.
//
// THE RULES THAT OUTRANK THE LAYOUT.
//
// 1. NULL IS NOT ZERO. Every scalar is a number or null, and null means "could
//    not be counted", never "there are none". Null renders as the words
//    NOT_AVAILABLE and never as a digit, a dash or a blank. A page that shows a
//    confident 0 devices while push is working sends someone to fix a system
//    that is fine. Every number on this page goes through Value for that
//    reason, including the ones inside the charts.
//
// 2. THE MERCHANT LIST ARRIVES SORTED AND STAYS SORTED. The server sorts it
//    quietest first with never-confirmed at the top. This file splits it into
//    two groups with filter, which preserves order, and never sorts it again.
//
// 3. INSTALLS CAN NEVER INCLUDE IPHONES. The browser event behind that count
//    does not exist on iOS, so it is labelled Android and desktop only and is
//    never called a total.
//
// 4. NUMBERS THAT ONLY START FROM A DATE SAY SO. installed_at and last_seen_at
//    began being written the day that code shipped. Everything before is
//    unrecoverable, so those counts sit together under one plain warning that
//    names the date tracking actually started.
//
// WHY THE CHARTS ARE HAND DRAWN. recharts 2.12.7 is already a dependency (see
// ProfilePage, which uses it for the price history bars) and framer-motion is
// too, so a library was available. Neither is used here. The two shapes this
// page needs are a proportion bar and twelve stacked columns, both of which are
// a div with a width and a div with a height. Pulling recharts in would add
// roughly a third of a megabyte to a page that is opened on a phone on a mobile
// connection, to draw two things that cost nothing in CSS.

const CARD = "bg-white rounded-2xl border border-ink-200 shadow-sm p-5";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-[14px] border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm px-5 hover:bg-coorg-50 transition-colors disabled:opacity-60";
const SECTION_TITLE = "font-display text-lg font-extrabold tracking-tight text-ink-900";
const EYEBROW = "text-[11px] font-bold uppercase tracking-wide text-ink-500";

// Chart series colours, applied by rank so the biggest slice always gets the
// first colour and the bar and its legend can never disagree.
const SERIES = [
  "bg-crop-600",
  "bg-ember-500",
  "bg-chilli-600",
  "bg-coorg-300",
  "bg-ink-600",
  "bg-crop-300",
  "bg-chilli-300",
  "bg-ember-300",
];

// How loud a merchant's silence looks. never is the only one that inverts,
// because a merchant who has never once confirmed a price is the single most
// actionable row on the page.
const BADGE_TONE = {
  never: "border-chilli-600 bg-chilli-600 text-white",
  chase: "border-chilli-100 bg-chilli-50 text-chilli-700",
  watch: "border-amber-100 bg-amber-50 text-amber-700",
  fresh: "border-crop-100 bg-crop-50 text-crop-700",
};

function pctOf(part, whole) {
  return whole > 0 ? (part / whole) * 100 : 0;
}

// EVERY NUMBER ON THIS PAGE GOES THROUGH HERE. Rule 1 lives in this component:
// a missing value becomes words, in a weight that cannot be mistaken for a
// figure, and never reaches formatCount.
//
// The size prop is the page's visual hierarchy in one place. "big" is a number
// worth acting on; "small" is context beside it. That difference is the whole
// point of the redesign, so it is a prop rather than a class scattered around.
function Value({ value, size = "big" }) {
  if (isMissing(value)) {
    return (
      <span className={size === "big" ? "text-base font-semibold text-ink-500" : "text-xs font-semibold text-ink-500"}>
        {NOT_AVAILABLE}
      </span>
    );
  }
  return (
    <span
      className={
        size === "big"
          ? "font-display text-4xl font-extrabold leading-none tracking-tight tabular-nums text-ink-900"
          : "text-sm font-bold tabular-nums text-ink-900"
      }
    >
      {formatCount(value)}
    </span>
  );
}

// The one number a card is about.
function Headline({ label, value, note }) {
  return (
    <div>
      <div className={EYEBROW}>{label}</div>
      <div className="mt-2">
        <Value value={value} />
      </div>
      {note && <p className="mt-2 text-xs leading-relaxed text-ink-500">{note}</p>}
    </div>
  );
}

// A supporting number. Deliberately much quieter than Headline.
function Row({ label, value, note }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <div className="min-w-0 text-sm text-ink-700">
        <span className="break-words">{label}</span>
        {note && <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">{note}</span>}
      </div>
      <div className="shrink-0">
        <Value value={value} size="small" />
      </div>
    </div>
  );
}

// Says why something is absent, so an empty area never reads as a zero.
function Unavailable({ text }) {
  return (
    <p className="rounded-xl border border-ink-200 bg-paper-2 px-3 py-2.5 text-sm font-semibold text-ink-600">
      {text}
    </p>
  );
}

function Chevron({ open }) {
  return (
    <svg
      width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
      className={open ? "rotate-180 transition-transform" : "transition-transform"}
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// THE FIRST THING ON THE PAGE. Not a title, not a definition, not a timestamp.
// It answers "is anything wrong right now" before the reader scrolls.
function AttentionCard({ merchants, pending }) {
  if (isMissing(merchants)) {
    return (
      <section className={CARD}>
        <div className={EYEBROW}>Needs attention</div>
        <p className="mt-2 text-base font-semibold text-ink-500">{NOT_AVAILABLE}</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-500">
          The merchant list could not be read, so nothing can be said about who has gone quiet.
          This is not the same as nothing being wrong.
        </p>
      </section>
    );
  }

  const quiet = merchants.filter(isQuietMerchant);
  const never = quiet.filter((m) => isMissing(m.daysSinceConfirmed));
  const waiting = !isMissing(pending) && pending > 0;
  const clear = quiet.length === 0;

  return (
    <section
      className={`rounded-2xl border shadow-sm p-5 ${clear ? "border-crop-200 bg-crop-50" : "border-chilli-200 bg-chilli-50"}`}
    >
      <div
        className={
          clear
            ? "text-[11px] font-bold uppercase tracking-wide text-crop-700"
            : "text-[11px] font-bold uppercase tracking-wide text-chilli-700"
        }
      >
        Needs attention
      </div>

      {clear ? (
        <>
          <p className="mt-2 font-display text-2xl font-extrabold leading-tight tracking-tight text-crop-700">
            Nothing has gone quiet
          </p>
          <p className="mt-1.5 text-sm font-semibold text-crop-700">
            All {formatCount(merchants.length)} merchants confirmed a price in the last {QUIET_DAYS} days.
          </p>
        </>
      ) : (
        <>
          <div className="mt-2 flex items-end gap-3">
            <span className="font-display text-6xl font-extrabold leading-none tracking-tight tabular-nums text-chilli-700">
              {formatCount(quiet.length)}
            </span>
            <span className="pb-1 text-sm font-bold leading-snug text-chilli-700">
              of {formatCount(merchants.length)} merchants
              <br />
              have gone quiet
            </span>
          </div>
          <ul className="mt-3 space-y-1 text-sm font-semibold text-chilli-700">
            <li>No price confirmed in {QUIET_DAYS} days or more.</li>
            {never.length > 0 && (
              <li>
                {formatCount(never.length)} of them {never.length === 1 ? "has" : "have"} never confirmed
                a price at all.
              </li>
            )}
          </ul>
        </>
      )}

      {waiting && (
        <p
          className={`mt-4 border-t pt-3 text-sm font-bold text-ink-800 ${clear ? "border-crop-200" : "border-chilli-200"}`}
        >
          {formatCount(pending)} {pending === 1 ? "merchant is" : "merchants are"} waiting for you to
          approve them.
        </p>
      )}
    </section>
  );
}

// One merchant, built to be scanned rather than read.
//
// The badge is a fixed width so that forty of these form a single column the
// eye can run down without reading a word, which is the difference between a
// list that works at four merchants and one that works at forty. Everything
// else on the row is secondary and truncates rather than wrapping, so every row
// is the same height.
function MerchantRow({ merchant }) {
  const quiet = quietness(merchant.daysSinceConfirmed);
  const lastConfirmed = formatDate(merchant.lastConfirmedAt);
  const listings = isMissing(merchant.activeListings)
    ? "listings not available"
    : merchant.activeListings === 1
      ? "1 live listing"
      : `${formatCount(merchant.activeListings)} live listings`;
  const flag = merchant.isDisabled ? "Disabled" : merchant.status !== "APPROVED" ? merchant.status : null;

  return (
    <li className="flex items-center gap-3 py-2.5">
      <span
        className={`flex h-9 w-14 shrink-0 items-center justify-center rounded-lg border text-[11px] font-extrabold uppercase tabular-nums ${BADGE_TONE[quiet.tone]}`}
      >
        {quiet.badge}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-bold text-ink-900">{merchant.businessName}</span>
        <span className="block truncate text-[11px] text-ink-500">
          {listings} &middot; {lastConfirmed ? `last price ${lastConfirmed}` : "never confirmed"}
        </span>
      </span>
      {flag && (
        <span className="shrink-0 rounded-full border border-ink-200 bg-paper-2 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-600">
          {flag}
        </span>
      )}
    </li>
  );
}

function MerchantGroups({ merchants }) {
  const [showActive, setShowActive] = useState(false);

  // filter preserves array order, so both groups come out in the server's
  // quietest-first order. See rule 2 at the top of this file. Nothing here
  // sorts, reverses or slices.
  const groups = useMemo(() => {
    if (isMissing(merchants)) return null;
    return {
      quiet: merchants.filter(isQuietMerchant),
      active: merchants.filter((m) => !isQuietMerchant(m)),
    };
  }, [merchants]);

  if (!groups) {
    return (
      <section className={CARD}>
        <h2 className={SECTION_TITLE}>Merchants</h2>
        <div className="mt-3">
          <Unavailable text="The merchant list could not be read, so nothing is shown rather than an empty list." />
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className={SECTION_TITLE}>
          Gone quiet <span className="text-ink-500">({formatCount(groups.quiet.length)})</span>
        </h2>
        <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
          Longest silent first. Merchants who have never confirmed a price are above everyone else.
        </p>
      </div>

      {groups.quiet.length === 0 ? (
        <div className={CARD}>
          <p className="text-sm font-semibold text-ink-600">
            Every merchant has confirmed a price in the last {QUIET_DAYS} days.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 rounded-2xl border border-ink-200 bg-white px-4 shadow-sm">
          {groups.quiet.map((m, i) => (
            <MerchantRow key={`${m.businessName}-${m.joinedAt}-${i}`} merchant={m} />
          ))}
        </ul>
      )}

      <div className="rounded-2xl border border-ink-200 bg-white shadow-sm">
        <button
          type="button"
          onClick={() => setShowActive((v) => !v)}
          aria-expanded={showActive}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 px-4 py-3 text-left"
        >
          <span className="font-display text-base font-extrabold tracking-tight text-ink-900">
            Active <span className="text-ink-500">({formatCount(groups.active.length)})</span>
          </span>
          <span className="flex shrink-0 items-center gap-1.5 text-xs font-bold text-coorg-700">
            {showActive ? "Hide" : "Show"}
            <Chevron open={showActive} />
          </span>
        </button>
        {showActive &&
          (groups.active.length === 0 ? (
            <p className="border-t border-ink-100 px-4 py-3 text-sm text-ink-600">
              No merchant has confirmed a price in the last {QUIET_DAYS} days.
            </p>
          ) : (
            <ul className="divide-y divide-ink-100 border-t border-ink-100 px-4">
              {groups.active.map((m, i) => (
                <MerchantRow key={`${m.businessName}-${m.joinedAt}-${i}`} merchant={m} />
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}

// A single stacked bar showing what share each kind of alert is.
//
// minWidth keeps a real but tiny slice visible. It distorts the bar by a pixel
// or two, which is the right trade for a shape whose job is proportion at a
// glance; the legend beside it carries the exact counts.
function ProportionBar({ entries, total }) {
  if (total <= 0) return <div className="h-3 w-full rounded-full bg-ink-100" />;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-full bg-ink-100">
      {entries.map((entry, i) => (
        <div
          key={entry.key}
          className={SERIES[i % SERIES.length]}
          style={{ width: `${pctOf(entry.count, total)}%`, minWidth: entry.count > 0 ? "3px" : 0 }}
        />
      ))}
    </div>
  );
}

function NotificationsCard({ reach }) {
  const ranked = rankedEntries(reach?.byType);
  const created = reach?.createdLast7Days;

  // The exact failure this page was rebuilt to catch: a headline that does not
  // match the sum of its own breakdown. It was 1,037 against 165 and nothing on
  // screen said a word about it. Now it does.
  const mismatch = ranked && typeof created === "number" && ranked.total !== created;

  return (
    <section className={CARD}>
      <Headline
        label="Alerts created in the last 7 days"
        value={created}
        note="One for each person notified. A Ready to Sell post creates one for every merchant, and a price confirmation creates one for every farmer following that crop. This counts what was created, not what was delivered: whether a phone actually received anything is not measured anywhere in this app."
      />

      {ranked && ranked.total > 0 && (
        <div className="mt-4">
          <ProportionBar entries={ranked.entries} total={ranked.total} />
          <ul className="mt-3 space-y-2">
            {ranked.entries.map((entry, i) => (
              <li key={entry.key} className="flex items-center gap-2.5">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-sm ${SERIES[i % SERIES.length]}`} />
                <span className="min-w-0 flex-1 truncate text-sm text-ink-700">
                  {notificationLabel(entry.key)}
                </span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900">
                  {formatCount(entry.count)}
                </span>
                <span className="w-10 shrink-0 text-right text-xs font-semibold tabular-nums text-ink-500">
                  {percentLabel(entry.count, ranked.total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ranked && ranked.total === 0 && (
        <p className="mt-4 text-sm font-semibold text-ink-600">
          No alerts were created in the last 7 days.
        </p>
      )}

      {!ranked && (
        <div className="mt-4">
          <Unavailable
            text={
              reach?.byTypeCapped
                ? "The breakdown by kind is not available: the last 7 days hold more alerts than this report reads in one go, and a partial breakdown would be wrong rather than merely short."
                : "The breakdown by kind could not be read."
            }
          />
        </div>
      )}

      {mismatch && (
        <p className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2.5 text-xs font-semibold leading-relaxed text-amber-700">
          These do not add up. The breakdown totals {formatCount(ranked.total)} against a headline of{" "}
          {formatCount(created)}. Trust neither until that is explained.
        </p>
      )}
    </section>
  );
}

// Twelve rolling seven day windows, oldest on the left, each split by who
// signed up. A shape here answers "are we growing" faster than any row of
// numbers can, which is the only reason it is a chart and not a list.
function SignupsCard({ signups, joinedThisWeek }) {
  const weeks = signups?.weeks;
  const peak = weeks && weeks.length > 0 ? Math.max(...weeks.map((w) => w.total)) : 0;

  return (
    <section className={CARD}>
      <Headline label="Signups in the last 7 days" value={joinedThisWeek} />

      {!weeks || weeks.length === 0 ? (
        <div className="mt-4">
          <Unavailable text="The signup history could not be read." />
        </div>
      ) : (
        <>
          <div className="mt-4 flex h-24 items-end gap-0.5 border-b border-ink-200">
            {weeks.map((week) => {
              const other = Math.max(0, week.total - week.farmers - week.merchants);
              return (
                <div
                  key={week.startsAt}
                  className="flex h-full flex-1 flex-col justify-end"
                  title={`Week of ${formatShortDate(week.startsAt)}: ${formatCount(week.total)} signups`}
                >
                  <div
                    className="flex w-full flex-col-reverse overflow-hidden rounded-t-sm"
                    style={{ height: `${pctOf(week.total, Math.max(1, peak))}%` }}
                  >
                    <div className="w-full bg-crop-600" style={{ height: `${pctOf(week.farmers, week.total)}%` }} />
                    <div className="w-full bg-ember-500" style={{ height: `${pctOf(week.merchants, week.total)}%` }} />
                    <div className="w-full bg-ink-300" style={{ height: `${pctOf(other, week.total)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-1.5 flex items-center justify-between text-[10px] font-semibold text-ink-500">
            <span>{formatShortDate(weeks[0].startsAt)}</span>
            <span>busiest week: {formatCount(peak)}</span>
            <span>this week</span>
          </div>

          <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
            <li className="flex items-center gap-2 text-xs text-ink-700">
              <span className="h-2.5 w-2.5 rounded-sm bg-crop-600" /> Farmers
            </li>
            <li className="flex items-center gap-2 text-xs text-ink-700">
              <span className="h-2.5 w-2.5 rounded-sm bg-ember-500" /> Merchants
            </li>
            <li className="flex items-center gap-2 text-xs text-ink-700">
              <span className="h-2.5 w-2.5 rounded-sm bg-ink-300" /> Everyone else
            </li>
          </ul>
        </>
      )}
    </section>
  );
}

// Builds the sentence naming when each column actually started holding data.
// The two dates can differ, and neither may be readable, so every combination
// gets wording that is true rather than one sentence with a hole in it.
function trackingSentence(tracking) {
  const seen = formatDate(tracking?.seenSince);
  const installed = formatDate(tracking?.installedSince);

  if (seen && installed && seen === installed) {
    return `Visits and installs have only been counted since ${seen}.`;
  }
  if (seen && installed) {
    return `Visits have only been counted since ${seen}, and installs since ${installed}.`;
  }
  if (seen) return `Visits have only been counted since ${seen}.`;
  if (installed) return `Installs have only been counted since ${installed}.`;
  return "Counting started recently, and the exact date could not be read.";
}

function ComingBackCard({ devices, farmers, tracking }) {
  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>Coming back</h2>

      <div className="mt-3 rounded-xl border border-ember-300 bg-paper-2 px-3 py-2.5">
        <p className="text-xs font-bold text-ink-800">These are not totals</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-600">
          {trackingSentence(tracking)} Anything before that was never recorded and can never be filled
          in, so read every number in this card as counting only from that date.
        </p>
      </div>

      <div className="mt-4">
        <Headline label="Opened the app in the last 7 days" value={devices?.seenLast7Days} />
      </div>

      <div className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
        <Row label="Opened the app in the last 24 hours" value={devices?.seenLast24Hours} />
        <Row label="Farmers who opened it in the last 7 days" value={farmers?.seenLast7Days} />
        <Row
          label="Installed on Android or desktop"
          value={devices?.installedAndroidDesktop}
          note="Android and desktop only, never a total. iPhone installs cannot be counted at all, because the browser event this relies on does not exist on iOS."
        />
      </div>
    </section>
  );
}

function PeopleCard({ users }) {
  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>People</h2>
      <div className="mt-3">
        <Headline label="Accounts in total" value={users?.total} />
      </div>
      <div className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
        <Row label="Farmers" value={users?.farmers} />
        <Row label="Merchants" value={users?.merchants} />
        <Row label="Approved merchants" value={users?.approved} />
        <Row label="Merchants waiting for review" value={users?.pending} />
        <Row label="Admins" value={users?.admins} />
      </div>
    </section>
  );
}

function FarmerActivityCard({ farmers }) {
  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>What farmers are doing</h2>
      <div className="mt-3">
        <Headline
          label="Ready to sell posts, all time"
          value={farmers?.readyToSellPosts}
          note="A farmer telling every merchant they have a crop ready."
        />
      </div>
      <div className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
        <Row label="Crops being followed" value={farmers?.cropFollows} />
        <Row
          label="Merchant contacts opened"
          value={farmers?.leadsOpened}
          note="A farmer opening a merchant's phone number. A different thing from a Ready to Sell post, and deliberately not added to it."
        />
      </div>
    </section>
  );
}

function AssistantCard({ assistant }) {
  const windowDays = assistant?.windowDays ?? 30;
  const ranked = rankedEntries(assistant?.bySource);
  const questions = assistant?.topQuestions;

  return (
    <section className={CARD}>
      <h2 className={SECTION_TITLE}>Assistant</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-ink-500">
        Counts and repeated question wording only. Nothing here says who asked anything.
      </p>

      <div className="mt-3">
        <Headline label={`Questions asked in the last ${windowDays} days`} value={assistant?.totalInWindow} />
      </div>

      <div className="mt-3 divide-y divide-ink-100 border-t border-ink-100">
        <Row label="Questions asked, all time" value={assistant?.total} />
      </div>

      <h3 className={`mt-4 ${EYEBROW}`}>How they were answered</h3>
      {ranked && ranked.total > 0 ? (
        <div className="mt-1 divide-y divide-ink-100">
          {ranked.entries.map((entry) => (
            <Row key={entry.key} label={assistantSourceLabel(entry.key)} value={entry.count} />
          ))}
        </div>
      ) : (
        <div className="mt-2">
          <Unavailable
            text={
              ranked
                ? "No questions were asked in this window."
                : "The breakdown by answer type could not be read."
            }
          />
        </div>
      )}

      <h3 className={`mt-4 ${EYEBROW}`}>Asked most often</h3>
      <div className="mt-1">
        {isMissing(questions) ? (
          <Unavailable text="The repeated question tally could not be read." />
        ) : questions.length === 0 ? (
          <Unavailable text="No questions were asked in this window." />
        ) : (
          <ol className="divide-y divide-ink-100">
            {questions.map((q, i) => (
              <li key={`${q.question}-${i}`} className="flex items-start justify-between gap-4 py-2.5">
                <span className="min-w-0 break-words text-sm text-ink-700">{q.question}</span>
                <span className="shrink-0 text-sm font-bold tabular-nums text-ink-900">
                  {formatCount(q.count)}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}

// Last, not first. The reader came for what is wrong, not for a definition and
// a timestamp, so the housekeeping sits at the bottom where it can be found
// when wanted and ignored when not.
function Footnote({ generatedAt, onRefresh, isFetching }) {
  return (
    <section className="rounded-2xl border border-ink-200 bg-paper-2 p-5">
      <p className="text-xs leading-relaxed text-ink-600">
        Anything that could not be counted reads{" "}
        <span className="font-bold text-ink-800">{NOT_AVAILABLE}</span>. It is never shown as zero,
        because a confident zero for something that is actually working is worse than no number.
      </p>
      {generatedAt && (
        <p className="mt-2 text-[11px] font-semibold text-ink-500">
          Counted at {formatDateTime(generatedAt) || generatedAt}
        </p>
      )}
      <button type="button" className={`${BUTTON} mt-3`} onClick={onRefresh} disabled={isFetching}>
        {isFetching ? "Loading" : "Refresh"}
      </button>
    </section>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-4">
      <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-5 h-32 animate-pulse" />
      <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-5 h-40 animate-pulse" />
      <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-5 h-40 animate-pulse" />
    </div>
  );
}

export default function MetricsPage() {
  const { data, isLoading, isError, error, refetch, isFetching } = useMetrics();

  return (
    <div className="flex flex-col flex-1 pb-10 w-full mx-auto max-w-3xl px-4 md:px-6 isolate">
      <GlowBackdrop />
      <Header showBack title="Metrics" />

      <main className="py-5 space-y-4">
        {isLoading && <LoadingCards />}

        {isError && (
          <div className="bg-white rounded-3xl border border-ink-200 shadow-sm p-8 text-center">
            <p className="text-sm font-semibold text-ink-700">
              {error?.message || "The metrics could not be loaded."}
            </p>
            <button type="button" className={`${BUTTON} mt-4`} onClick={() => refetch()}>
              Try again
            </button>
          </div>
        )}

        {data && (
          <>
            <AttentionCard merchants={data.merchants} pending={data.users?.pending} />
            <MerchantGroups merchants={data.merchants} />
            <NotificationsCard reach={data.reach} />
            <SignupsCard signups={data.signups} joinedThisWeek={data.users?.joinedThisWeek} />
            <ComingBackCard devices={data.devices} farmers={data.farmers} tracking={data.tracking} />
            <PeopleCard users={data.users} />
            <FarmerActivityCard farmers={data.farmers} />
            <AssistantCard assistant={data.assistant} />
            <Footnote generatedAt={data.generatedAt} onRefresh={() => refetch()} isFetching={isFetching} />
          </>
        )}
      </main>
    </div>
  );
}

import { format } from "date-fns";
import { Header } from "../../components/layout/Header";
import { GlowBackdrop } from "../../components/ui/GlowBackdrop";
import { useMetrics } from "./useMetrics";

// The admin metrics readout.
//
// ENGLISH ONLY, AND NOT TRANSLATED ON PURPOSE, the same rule the push
// diagnostics screen follows. This is an operator's console read by one person.
// It carries no i18n keys, so nothing here can leak into the app's real
// Kannada vocabulary by accident.
//
// TWO RULES GOVERN EVERY LINE BELOW, AND BOTH MATTER MORE THAN THE LAYOUT.
//
// 1. NULL IS NOT ZERO. Every scalar in the response is a number or null, and
//    null means "this could not be counted", never "there are none". So null
//    renders as the words "Not available" and never as a digit. A dashboard
//    that confidently reports 0 registered devices while push is working is
//    worse than one that reports nothing at all: the first sends someone off
//    to fix a system that is fine, the second sends them to look at the count.
//    Nothing in this file may substitute a zero, a dash, or an empty cell.
//
// 2. THE MERCHANT LIST ARRIVES SORTED AND IS RENDERED IN THE ORDER GIVEN. The
//    function sorts quietest first with never-confirmed above everyone else,
//    and the top of that list is the single most useful thing on this page: it
//    is which merchants have gone silent. No sort, filter, slice or reverse is
//    applied here. That is why the list section sits above the counts.
//
// PHONE FIRST. Read on a phone far more often than at a desk, so: one column,
// stacked cards, label and value on one row inside a card, and the merchant
// list as a vertical list of cards. No wide tables anywhere, because a table
// that needs sideways scrolling on a phone is a table nobody reads.

// Days without a confirmed price before a merchant is worth chasing, and the
// earlier point at which they are worth watching. Named rather than inlined so
// the two thresholds are visible in one place instead of buried in a colour.
const CHASE_DAYS = 7;
const WATCH_DAYS = 3;

const CARD = "bg-white rounded-2xl border border-ink-200 shadow-sm p-5";
const BUTTON =
  "inline-flex min-h-[44px] items-center justify-center rounded-[14px] border-2 border-coorg-600 text-coorg-700 bg-white font-bold text-sm px-5 hover:bg-coorg-50 transition-colors disabled:opacity-60";

// The notification types notifications_type_chk allows, in the order they are
// worth reading, with the English for each. Anything the function returns that
// is not listed here still renders, under its raw key, so a type added to the
// database shows up as an odd looking row rather than vanishing.
const NOTIFICATION_LABELS = {
  price_alert: "Price alerts",
  seller_lead: "Ready to sell posts",
  seller_lead_response: "Merchant replies to a post",
  merchant_approved: "Merchant approved",
  merchant_rejected: "Merchant rejected",
  price_reminder: "Price reminders",
};

// The assistant_logs sources, same treatment as above.
const ASSISTANT_SOURCE_LABELS = {
  smalltalk: "Small talk",
  blocked: "Blocked before answering",
  data: "Answered from app data",
  general: "General answer",
  knowledge: "Answered from knowledge",
  outside: "Outside what it covers",
  error: "Failed with an error",
};

function formatCount(n) {
  return new Intl.NumberFormat("en-IN").format(n);
}

function formatDate(iso) {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "d MMM yyyy");
}

function formatDateTime(iso) {
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return format(parsed, "d MMM yyyy, h:mm a");
}

// Turn a { key: number | null } object into rows in a known order, keeping any
// key the labels do not know about rather than dropping it. See the comment on
// NOTIFICATION_LABELS for why silently dropping one would be the wrong answer.
function labelledRows(record, labels) {
  if (!record) return null;
  const known = Object.keys(labels).filter((k) => k in record);
  const unknown = Object.keys(record).filter((k) => !(k in labels));
  return [...known, ...unknown].map((k) => ({
    key: k,
    label: labels[k] || k,
    value: record[k],
  }));
}

// One label and one number. Rule 1 lives here: a null or undefined value never
// reaches formatCount, it becomes the words instead, in a lighter weight so it
// cannot be mistaken for a figure at a glance.
function Stat({ label, value, note }) {
  const missing = value === null || value === undefined;
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="min-w-0 text-sm text-ink-700">
        <span className="break-words">{label}</span>
        {note && <span className="mt-0.5 block text-[11px] leading-snug text-ink-500">{note}</span>}
      </dt>
      <dd
        className={
          missing
            ? "shrink-0 text-[13px] font-semibold text-ink-500"
            : "shrink-0 font-display text-lg font-extrabold tracking-tight tabular-nums text-ink-900"
        }
      >
        {missing ? "Not available" : formatCount(value)}
      </dd>
    </div>
  );
}

function Section({ title, subtitle, children }) {
  return (
    <section className={CARD}>
      <h2 className="font-display text-base font-extrabold tracking-tight text-ink-900">{title}</h2>
      {subtitle && <p className="mt-1 text-xs leading-relaxed text-ink-500">{subtitle}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

// Used where a whole grouped section came back null, so the section says why it
// is empty instead of rendering an empty list that reads as "there are none".
function Unavailable({ text }) {
  return (
    <p className="rounded-xl border border-ink-200 bg-paper-2 px-3 py-2.5 text-sm font-semibold text-ink-600">
      {text}
    </p>
  );
}

function StatusPill({ status }) {
  const map = {
    APPROVED: "bg-crop-50 text-crop-700 border-crop-100",
    PENDING: "bg-amber-50 text-amber-700 border-amber-100",
    REJECTED: "bg-chilli-50 text-chilli-700 border-chilli-100",
  };
  const cls = map[status] || "bg-paper-2 text-ink-600 border-ink-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide whitespace-nowrap ${cls}`}
    >
      {status}
    </span>
  );
}

// How loudly one merchant's silence should read.
//
// daysSinceConfirmed is null when the merchant has never confirmed a price at
// all, which is the loudest case there is and gets the same chilli treatment as
// a long silence. It is deliberately not folded in with "0 days".
function quietness(days) {
  if (days === null || days === undefined) {
    return {
      headline: "Never confirmed a price",
      cls: "bg-chilli-50 border-chilli-100 text-chilli-700",
    };
  }
  if (days >= CHASE_DAYS) {
    return {
      headline: `Quiet for ${formatCount(days)} days`,
      cls: "bg-chilli-50 border-chilli-100 text-chilli-700",
    };
  }
  if (days >= WATCH_DAYS) {
    return {
      headline: `Quiet for ${formatCount(days)} days`,
      cls: "bg-amber-50 border-amber-100 text-amber-700",
    };
  }
  if (days <= 0) {
    return { headline: "Confirmed today", cls: "bg-crop-50 border-crop-100 text-crop-700" };
  }
  if (days === 1) {
    return { headline: "Confirmed yesterday", cls: "bg-crop-50 border-crop-100 text-crop-700" };
  }
  return {
    headline: `Confirmed ${formatCount(days)} days ago`,
    cls: "bg-crop-50 border-crop-100 text-crop-700",
  };
}

function MerchantRow({ merchant }) {
  const quiet = quietness(merchant.daysSinceConfirmed);
  const lastConfirmed = formatDate(merchant.lastConfirmedAt);
  const joined = formatDate(merchant.joinedAt);
  const listings = merchant.activeListings;

  return (
    <li className="bg-white rounded-2xl border border-ink-200 shadow-sm p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-display text-base font-extrabold tracking-tight text-ink-900 break-words">
            {merchant.businessName}
          </div>
          {joined && <div className="mt-0.5 text-xs text-ink-500">Joined {joined}</div>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <StatusPill status={merchant.status} />
          {merchant.isDisabled && (
            <span className="inline-flex items-center rounded-full border border-chilli-100 bg-chilli-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-chilli-700 whitespace-nowrap">
              Disabled
            </span>
          )}
        </div>
      </div>

      <div className={`mt-3 rounded-xl border px-3 py-2 ${quiet.cls}`}>
        <div className="text-sm font-bold">{quiet.headline}</div>
        <div className="mt-0.5 text-[11px] font-semibold">
          {lastConfirmed ? `Last confirmed ${lastConfirmed}` : "No listing has ever been confirmed"}
        </div>
      </div>

      <div className="mt-2 text-xs font-semibold text-ink-600">
        {listings === 1 ? "1 live listing" : `${formatCount(listings)} live listings`}
      </div>
    </li>
  );
}

function MerchantsSection({ merchants }) {
  if (merchants === null || merchants === undefined) {
    return (
      <Section
        title="Merchant activity"
        subtitle="Quietest first, with merchants who have never confirmed a price at the top."
      >
        <Unavailable text="Not available. The merchant list could not be read, so nothing is shown rather than an empty list." />
      </Section>
    );
  }

  if (merchants.length === 0) {
    return (
      <Section title="Merchant activity" subtitle="Quietest first.">
        <Unavailable text="There are no merchant accounts yet." />
      </Section>
    );
  }

  return (
    <section>
      <h2 className="font-display text-lg font-extrabold tracking-tight text-ink-900">
        Merchant activity
      </h2>
      <p className="mt-1 text-xs leading-relaxed text-ink-500">
        {formatCount(merchants.length)} merchants, quietest first. Merchants who have never confirmed
        a price are at the top. This order is exactly as the server sent it.
      </p>
      {/* No sort, filter or slice. See rule 2 at the top of this file. */}
      <ul className="mt-3 space-y-3">
        {merchants.map((m, i) => (
          <MerchantRow key={`${m.businessName}-${m.joinedAt}-${i}`} merchant={m} />
        ))}
      </ul>
    </section>
  );
}

function TopQuestions({ questions }) {
  if (questions === null || questions === undefined) {
    return <Unavailable text="Not available. The repeated question tally could not be read." />;
  }
  if (questions.length === 0) {
    return <Unavailable text="No questions were asked in this window." />;
  }
  return (
    <ol className="divide-y divide-ink-100">
      {questions.map((q, i) => (
        <li key={`${q.question}-${i}`} className="flex items-start justify-between gap-4 py-2.5">
          <span className="min-w-0 break-words text-sm text-ink-700">{q.question}</span>
          <span className="shrink-0 font-display text-sm font-extrabold tabular-nums text-ink-900">
            {formatCount(q.count)}
          </span>
        </li>
      ))}
    </ol>
  );
}

function LoadingCards() {
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-ink-200 shadow-sm p-5 h-40 animate-pulse" />
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

      <main className="py-5 space-y-5">
        <div className={CARD}>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="font-display text-lg font-extrabold tracking-tight text-ink-900">
                What is happening in the app
              </h1>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">
                Counted on the server. A figure that could not be counted reads{" "}
                <span className="font-bold text-ink-700">Not available</span> and is never shown as
                zero.
              </p>
            </div>
            <button type="button" className={BUTTON} onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? "Loading" : "Refresh"}
            </button>
          </div>
          {data?.generatedAt && (
            <p className="mt-3 text-[11px] font-semibold text-ink-500">
              Counted at {formatDateTime(data.generatedAt) || data.generatedAt}
            </p>
          )}
        </div>

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
            {/* First on the page on purpose. See rule 2 at the top of this file. */}
            <MerchantsSection merchants={data.merchants} />

            <Section title="People">
              <dl className="divide-y divide-ink-100">
                <Stat label="All accounts" value={data.users?.total} />
                <Stat label="Farmers" value={data.users?.farmers} />
                <Stat label="Merchants" value={data.users?.merchants} />
                <Stat label="Admins" value={data.users?.admins} />
                <Stat label="Joined in the last 7 days" value={data.users?.joinedThisWeek} />
                <Stat label="Merchants approved" value={data.users?.approved} />
                <Stat label="Merchants waiting for review" value={data.users?.pending} />
              </dl>
            </Section>

            <Section
              title="Devices and installs"
              subtitle="Whether people are coming back, and how many put the app on a home screen."
            >
              <dl className="divide-y divide-ink-100">
                {/* Never labelled "installs". The browser event behind this
                    count does not exist on iOS at all, so every iPhone install
                    is missing from it by definition and always will be. */}
                <Stat
                  label="Installed on Android or desktop"
                  value={data.devices?.installedAndroidDesktop}
                  note="Android and desktop only. iPhone installs are never counted, because the browser event this relies on does not exist on iOS. This is not a total."
                />
                <Stat label="Opened the app in the last 24 hours" value={data.devices?.seenLast24Hours} />
                <Stat label="Opened the app in the last 7 days" value={data.devices?.seenLast7Days} />
              </dl>
            </Section>

            <Section title="Reach" subtitle="Push registrations, and what actually went out this week.">
              <dl className="divide-y divide-ink-100">
                <Stat label="Devices registered for push" value={data.reach?.devices} />
                <Stat label="Notifications sent in the last 7 days" value={data.reach?.sentLast7Days} />
              </dl>
              <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-ink-500">
                Sent in the last 7 days, by kind
              </h3>
              {labelledRows(data.reach?.byType, NOTIFICATION_LABELS) ? (
                <dl className="mt-1 divide-y divide-ink-100">
                  {labelledRows(data.reach.byType, NOTIFICATION_LABELS).map((row) => (
                    <Stat key={row.key} label={row.label} value={row.value} />
                  ))}
                </dl>
              ) : (
                <div className="mt-2">
                  <Unavailable text="Not available. The breakdown by kind could not be read." />
                </div>
              )}
            </Section>

            <Section title="Farmer activity">
              <dl className="divide-y divide-ink-100">
                <Stat
                  label="Ready to sell posts"
                  value={data.farmers?.readyToSellPosts}
                  note="What a farmer posts from the feed. All time."
                />
                <Stat label="Crop follows" value={data.farmers?.cropFollows} />
                <Stat
                  label="Merchant contact leads"
                  value={data.farmers?.leadsOpened}
                  note="A different thing from a ready to sell post, and deliberately not added to it."
                />
                <Stat
                  label="Farmers who opened the app in the last 7 days"
                  value={data.farmers?.seenLast7Days}
                />
              </dl>
            </Section>

            <Section
              title="Assistant"
              subtitle="Counts and repeated question text only. Nothing here identifies who asked anything."
            >
              <dl className="divide-y divide-ink-100">
                <Stat label="Questions asked, all time" value={data.assistant?.total} />
                <Stat
                  label={`Questions asked in the last ${data.assistant?.windowDays ?? 30} days`}
                  value={data.assistant?.totalInWindow}
                />
              </dl>

              <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-ink-500">
                How they were answered
              </h3>
              {labelledRows(data.assistant?.bySource, ASSISTANT_SOURCE_LABELS) ? (
                <dl className="mt-1 divide-y divide-ink-100">
                  {labelledRows(data.assistant.bySource, ASSISTANT_SOURCE_LABELS).map((row) => (
                    <Stat key={row.key} label={row.label} value={row.value} />
                  ))}
                </dl>
              ) : (
                <div className="mt-2">
                  <Unavailable text="Not available. The breakdown by answer type could not be read." />
                </div>
              )}

              <h3 className="mt-4 text-[11px] font-bold uppercase tracking-wide text-ink-500">
                Most repeated questions
              </h3>
              <div className="mt-1">
                <TopQuestions questions={data.assistant?.topQuestions} />
              </div>
            </Section>
          </>
        )}
      </main>
    </div>
  );
}

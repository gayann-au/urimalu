import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
import { lastCheckedText } from "./DataAgeLine";
import {
  weatherCodeKey,
  rainBand,
  rainDotClass,
  formatRainMm,
  formatTemperature,
  formatSunshineHours,
  formatRainChance,
} from "../../lib/weatherWords";
import { useKodaguWeather, WEATHER_TOWNS } from "./useKodaguWeather";
import { Explainer } from "./Explainer";
import { SectionEyebrow } from "./SectionEyebrow";

// SECTION B. Rain and weather, one card per town.
//
// THE POINT OF THIS SECTION IS THE MERGE. Every source that publishes this
// locally splits it up: rainfall on one screen, forecast on another, and the
// current temperature nowhere at all. So a reader who wants to know what it is
// doing in Virajpet right now and how much rain has already fallen there has to
// hold two screens in their head and join them. Here the facts sit on one card,
// for one town, and the joining is done.
//
// No advice anywhere. This says how warm it is, how much sun there was, how
// likely rain is, and how much rain fell and is coming. It never says whether
// that is good for drying, good for picking, or good for anything else, and it
// never tells anyone what to do about it.

// Card width. 76% of a phone leaves a clear slice of the next card showing at
// the right edge, which is the only thing that tells a reader the row scrolls.
// A card sized to fill the width reads as the whole content, and sixteen towns
// then go unseen.
const CARD_WIDTH = "w-[76%] max-w-[264px] sm:w-[248px]";

// One town. Six facts, in the order a reader asks for them: where, what it is
// like now, how much sun and how likely rain today, then what has already
// fallen and what is coming.
function TownCard({ reading, index }) {
  const { t } = useTranslation();
  const m = useUriMotion();

  const temperature = formatTemperature(reading.temperatureC);
  const conditionKey = weatherCodeKey(reading.weatherCode);
  const sunshine = formatSunshineHours(reading.sunshineTodayS);
  const rainChance = formatRainChance(reading.rainChanceTodayPct);

  return (
    <motion.article
      variants={m.fadeUp}
      whileTap={m.btnTap}
      // Read by the arrow buttons, which find the next resting position from
      // the real DOM order rather than from a second list kept in step with it.
      // Indexes the filtered list, not the full one, which is what makes the
      // arrows step through what is actually on screen.
      data-town-index={index}
      className={`snap-start shrink-0 ${CARD_WIDTH} overflow-hidden rounded-[18px] border border-ink-100 bg-white shadow-uri-md`}
    >
      {/* The town name sits on its own warm band, so a reader scanning a row of
          cards finds the place first and the numbers second. */}
      <div className="border-b border-ink-100 bg-paper px-4 py-2.5">
        <h3 className="font-display text-sm font-extrabold leading-tight tracking-tight text-ink-900">
          {t(`weather.town.${reading.name}`)}
        </h3>
      </div>

      <div className="p-4">
        {/* THE HERO. The temperature is the one number that dominates this
            card, with the condition in words directly under it. A missing
            reading drops its own line rather than printing a placeholder
            degree, and an unrecognised WMO code drops the words but keeps the
            number, because the temperature is still a fact we can stand
            behind. */}
        <div className="min-h-[58px]">
          {temperature ? (
            <p className="font-display text-4xl font-extrabold leading-none tracking-tight text-ink-900 tabular-nums">
              {t("weather.degrees", { value: temperature })}
            </p>
          ) : (
            <p className="text-sm text-ink-500">{t("weather.noReading")}</p>
          )}
          {conditionKey && (
            <p className="mt-1.5 text-sm text-ink-600">{t(conditionKey)}</p>
          )}
        </div>

        {/* Today's two figures, side by side. Each is dropped on its own when
            the vendor did not send it, so one gap does not cost the other. */}
        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-ink-100 pt-3">
          <TodayFact labelKey="weather.sunToday" value={sunshine && t("weather.hours", { value: sunshine })}/>
          <TodayFact labelKey="weather.rainChanceToday" value={rainChance && t("weather.percent", { value: rainChance })}/>
        </div>

        <div className="mt-3 space-y-2.5 border-t border-ink-100 pt-3">
          <RainLine labelKey="weather.rainPast" mm={reading.rainPast3Mm}/>
          <RainLine labelKey="weather.rainNext" mm={reading.rainNext3Mm}/>
        </div>
      </div>
    </motion.article>
  );
}

// One of today's two small figures. Renders the label either way, so a missing
// value reads as "we do not have this" rather than as the fact not existing.
function TodayFact({ labelKey, value }) {
  const { t } = useTranslation();
  return (
    <div>
      <p className="text-[11px] leading-tight text-ink-500">{t(labelKey)}</p>
      <p className={`mt-0.5 text-base font-bold tabular-nums ${value ? "text-ink-900" : "text-ink-500"}`}>
        {value || t("weather.notReported")}
      </p>
    </div>
  );
}

// One rain figure: what window it covers, how many millimetres, and how much
// rain that is in plain words.
//
// The colour lives on the dot and never on the number. See the colour rule in
// weatherWords.js: the band is always carried by words as well as hue, so the
// dot is decoration on a fact already fully stated in text, and the mm figure
// stays in ink-900 where it is readable.
function RainLine({ labelKey, mm }) {
  const { t } = useTranslation();
  const band = rainBand(mm);
  const amount = formatRainMm(mm);

  // No usable total means no figure. A three day sum missing one of its days is
  // dropped upstream rather than shown short, so reaching here with null means
  // there is genuinely nothing to report for this window.
  if (!band || amount === null) {
    return (
      <div>
        <p className="text-[11px] leading-tight text-ink-500">{t(labelKey)}</p>
        <p className="text-sm text-ink-500">{t("weather.notReported")}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-[11px] leading-tight text-ink-500">{t(labelKey)}</p>
      <div className="mt-0.5 flex items-baseline gap-2">
        <p className="text-lg font-bold leading-none text-ink-900 tabular-nums">
          {t("weather.mm", { value: amount })}
        </p>
        <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-600">
          <span
            aria-hidden="true"
            className={`h-2 w-2 shrink-0 rounded-full ${rainDotClass(band.band)}`}
          />
          {t(band.key)}
        </span>
      </div>
    </div>
  );
}

// THE DOT ROW IS GONE, AND WHY.
//
// It read "1 of 5" with a dot per town, which worked at five and does not work
// at seventeen. Seventeen dots on a 360px phone are roughly nine pixels apart:
// too small to aim a thumb at, and a row of them says "many" rather than any
// useful number. The sentence under the strip now carries the count in words,
// which is the part of that control that was ever doing the work, and the
// arrows below handle the jumping on a screen that has room for them.
//
// What replaced it also has to answer the question the dots answered: a farmer
// who does not think to swipe sees Madikeri and part of Virajpet and reasonably
// concludes that is the whole list. The peek at the right edge hints at it; the
// hint line states it.

// One arrow. Desktop only, and only because a mouse has no swipe.
//
// hidden below sm on purpose: a thumb already scrolls this row directly, and
// two buttons on a phone would take width from the cards to duplicate a gesture
// that works. Disabled at each end rather than hidden, so the control does not
// move under the cursor as the row scrolls.
//
// Chilli on the border is the app's ordinary button treatment. It marks a
// control, never a value: there is no number anywhere near it and no card is
// coloured by what it says.
function ScrollArrow({ direction, onClick, disabled, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="hidden h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-chilli-600 bg-white text-chilli-700 transition-colors hover:bg-chilli-50 disabled:border-ink-200 disabled:text-ink-300 disabled:hover:bg-white sm:grid"
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d={direction === "left" ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"}/>
      </svg>
    </button>
  );
}

// The filter box above the strip.
//
// Plain text, matched as a substring against the town name in the language on
// screen and against the English key underneath it, so a reader typing "madi"
// in the Kannada UI still finds ಮಡಿಕೇರಿ. It never guesses at a near match and
// never reorders the results: a filter that quietly promoted a fuzzy match
// would put one town's card where a reader expected another's.
//
// No search button and no submit. It filters as it is typed, and emptying it
// shows every town again.
function TownFilter({ value, onChange, inputId }) {
  const { t } = useTranslation();
  return (
    <div className="mt-3">
      <label htmlFor={inputId} className="block text-xs text-ink-600">
        {t("weather.filterLabel")}
      </label>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={inputId}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("weather.filterPlaceholder")}
          autoComplete="off"
          // enterKeyHint done rather than search: there is nothing to submit,
          // and a search key on the phone keyboard promises an action that does
          // not exist here.
          enterKeyHint="done"
          className="min-h-[44px] w-full min-w-0 rounded-[12px] border border-ink-200 bg-white px-3 text-sm text-ink-900 placeholder:text-ink-400 focus:border-chilli-600 focus:outline-none focus:ring-2 focus:ring-chilli-600/20"
        />
        {value !== "" && (
          <button
            type="button"
            onClick={() => onChange("")}
            className="min-h-[44px] shrink-0 rounded-[12px] border-2 border-chilli-600 bg-white px-3 text-xs font-bold text-chilli-700 transition-colors hover:bg-chilli-50"
          >
            {t("weather.filterClear")}
          </button>
        )}
      </div>
    </div>
  );
}

// How close two scroll offsets have to be to count as the same position.
//
// Snap points land on sub-pixel offsets and scrollLeft is fractional in every
// current browser, so an exact comparison would leave the right arrow enabled
// at the far right of the row, doing nothing when clicked. Four pixels is
// smaller than any gap between cards and larger than the residue.
const SCROLL_EPSILON_PX = 4;

export function WeatherByTown() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const weatherQ = useKodaguWeather();

  // data is { readings, fetchedAt } now, never a bare array. See the contract
  // note on useKodaguWeather.
  const readings = weatherQ.data?.readings;
  const fetchedAt = weatherQ.data?.fetchedAt;

  const scrollerRef = useRef(null);
  const filterId = useId();
  const [filter, setFilter] = useState("");

  // The towns on screen. Matched against the name in the current language and
  // against the English key, so "madi" finds ಮಡಿಕೇರಿ in the Kannada UI and
  // "ಮಡಿ" finds it in either.
  //
  // Order is never touched. This filters a list, it does not rank one.
  const shown = useMemo(() => {
    if (!readings) return [];
    const needle = filter.trim().toLowerCase();
    if (needle === "") return readings;
    return readings.filter((reading) => {
      const label = String(t(`weather.town.${reading.name}`)).toLowerCase();
      return (
        label.includes(needle) || reading.name.toLowerCase().includes(needle)
      );
    });
  }, [readings, filter, t]);

  // Whether the row is against either end, which is the only thing the arrows
  // need to know. The dot row's nearest-card arithmetic went with the dots: no
  // control on screen claims a position any more, so nothing has to compute
  // one.
  //
  // The listener is passive and coalesced to one frame, so a swipe does two
  // comparisons per frame rather than work on every event. It re-runs when the
  // filter changes because a narrower list has a different scroll width, and an
  // arrow left enabled against a row that can no longer move is a control that
  // lies.
  const [ends, setEnds] = useState({ atStart: true, atEnd: true });

  useEffect(() => {
    const root = scrollerRef.current;
    if (!root) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const max = root.scrollWidth - root.clientWidth;
      setEnds({
        atStart: root.scrollLeft <= SCROLL_EPSILON_PX,
        atEnd: root.scrollLeft >= max - SCROLL_EPSILON_PX,
      });
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    // A width change moves the far end without any scroll event firing, which
    // is how the right arrow ended up enabled on a row that had nothing left to
    // scroll to after a filter narrowed it.
    const observer = new ResizeObserver(onScroll);
    observer.observe(root);
    return () => {
      root.removeEventListener("scroll", onScroll);
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
    };
  }, [shown]);

  // Move the row by exactly one card.
  //
  // Reads the real card positions rather than multiplying a width by a count,
  // because the cards are a percentage of the viewport up to a maximum and a
  // computed width would be wrong at most screen sizes.
  //
  // Instant rather than smooth, which is not a taste call. scrollIntoView with
  // behavior "smooth" was measured moving this row forwards and refusing to
  // move it backwards: snap-mandatory re-snaps to the nearest point mid
  // animation, so a short leftward glide gets pulled back to where it started.
  // Setting the offset outright lands on a snap point every time, both ways.
  function scrollByOneCard(direction) {
    const root = scrollerRef.current;
    if (!root) return;
    const cards = Array.from(root.querySelectorAll("[data-town-index]"));
    if (cards.length === 0) return;

    const x = root.scrollLeft;
    const stops = cards.map((card) => card.offsetLeft - root.offsetLeft);
    const target =
      direction === "right"
        ? stops.find((stop) => stop > x + SCROLL_EPSILON_PX)
        : [...stops].reverse().find((stop) => stop < x - SCROLL_EPSILON_PX);
    if (target == null) return;
    root.scrollTo({ left: target, behavior: "auto" });
  }

  // "When we last looked", in the same sentence every price card carries.
  //
  // The timestamp is the moment Open-Meteo's response came back, taken in the
  // hook, not the moment this rendered. A reading held in the query cache for
  // twenty minutes says twenty minutes ago, which is exactly what the old
  // "Conditions right now" heading could not say.
  const checkedLine = fetchedAt != null ? lastCheckedText(fetchedAt, t) : null;

  const isFiltered = filter.trim() !== "";
  const total = readings?.length ?? 0;

  return (
    <motion.section
      className="mt-9"
      aria-label={t("weather.heading")}
      variants={m.stagger}
      initial="hidden"
      // THIS IS THE BUG THAT MADE THE SECTION BLANK. It was whileInView with
      // viewport={{ once: true, amount: 0.2 }}. Every child here carries the
      // fadeUp variant, whose hidden state is opacity 0, so until that trigger
      // fires the entire section is invisible while still holding its full
      // height. When it does not fire, and a one-shot observer against a
      // threshold has several ways not to, the result is a tall silent gap
      // with the heading, the five cards and their data all present in the DOM
      // at opacity 0. Measured in the browser: state "populated", five
      // articles, 304px tall each, opacity 0.
      //
      // animate is a standing instruction rather than an event, so there is no
      // trigger left to miss. TodaysRatesBoard has always used it, which is
      // exactly why that section never showed this failure.
      animate="show"
    >
      <motion.div variants={m.fadeUp}>
        <SectionEyebrow labelKey="weather.eyebrow"/>
        <div className="mt-1.5 flex flex-wrap items-start justify-between gap-x-3">
          <h2 className="font-display text-[26px] font-extrabold leading-none tracking-tight text-ink-900">
            {t("weather.heading")}
          </h2>
          <Explainer bodyKey="market.explain.weather"/>
        </div>
        <p className="mt-1.5 text-sm text-ink-500">{t("weather.intro")}</p>
      </motion.div>

      <div className="mt-3">
        {weatherQ.isLoading ? (
          // NEVER A SILENT GAP. The skeleton used to be five textless white
          // cards on near-white paper, which is indistinguishable from empty
          // space, so a slow or stalled request read as a broken app rather
          // than as waiting. It says what it is doing now, in words, above the
          // same scroll row so the layout still does not jump when data lands.
          <div data-state="loading">
            <p className="mb-2 text-sm text-ink-500">{t("weather.loading")}</p>
            <ScrollRow ariaLabel={t("weather.loading")} state="loading">
              {WEATHER_TOWNS.map((name) => (
                <div
                  key={name}
                  className={`snap-start shrink-0 ${CARD_WIDTH} h-[290px] animate-pulse rounded-[18px] border border-ink-200 bg-paper-2`}
                />
              ))}
            </ScrollRow>
          </div>
        ) : weatherQ.isError ? (
          <div data-state="error">
            <LoadError onRetry={() => weatherQ.refetch()}/>
          </div>
        ) : !readings || readings.length === 0 ? (
          <div
            className="rounded-[18px] border border-ink-100 bg-white p-6 text-sm text-ink-500 shadow-uri-sm"
            data-state="empty"
          >
            {t("weather.empty")}
          </div>
        ) : (
          <div data-state="populated">
            <TownFilter value={filter} onChange={setFilter} inputId={filterId}/>

            {/* A filter that matches nothing says so in a sentence, in the
                space the cards would have taken. An empty strip with a live
                filter box above it reads as an app that broke rather than as a
                word that matched no town. */}
            {shown.length === 0 ? (
              <p className="mt-3 rounded-[18px] border border-ink-100 bg-white p-5 text-sm text-ink-500 shadow-uri-sm">
                {t("weather.filterNoMatch")}
              </p>
            ) : (
              <div className="mt-3 flex items-center gap-2">
                <ScrollArrow
                  direction="left"
                  onClick={() => scrollByOneCard("left")}
                  disabled={ends.atStart}
                  label={t("weather.scrollLeft")}
                />
                <ScrollRow
                  ariaLabel={t("weather.heading")}
                  state="populated"
                  stagger={m.stagger}
                  scrollerRef={scrollerRef}
                >
                  {shown.map((reading, i) => (
                    <TownCard key={reading.name} reading={reading} index={i}/>
                  ))}
                </ScrollRow>
                <ScrollArrow
                  direction="right"
                  onClick={() => scrollByOneCard("right")}
                  disabled={ends.atEnd}
                  label={t("weather.scrollRight")}
                />
              </div>
            )}

            {/* THE LINE THAT REPLACED THE DOTS. It says how many towns are in
                the strip and that the strip moves, both in words, because a row
                that scrolls looks exactly like a row that does not until you
                try it.
                The swipe half is dropped at one card, where there is nothing to
                swipe to and the sentence would be false. */}
            {shown.length > 0 && (
              <p className="mt-2 text-xs text-ink-500">
                {/* Not named count. i18next treats a count variable as the
                    plural selector and looks for swipeHint_one and
                    swipeHint_other before the key itself, which is a fallback
                    path nobody here wants to depend on. These are plain
                    interpolations. */}
                {isFiltered
                  ? t("weather.filterMatch", { shown: shown.length, total })
                  : shown.length > 1
                    ? t("weather.swipeHint", { towns: shown.length })
                    : t("weather.oneTown")}
              </p>
            )}
          </div>
        )}
      </div>

      {/* ATTRIBUTION, AND THE ONE LINK IN THIS FEATURE.
          Open-Meteo publishes under CC BY 4.0, which requires crediting the
          source and linking it. That is a licence condition, not a choice, and
          it is the single exception to this feature's rule that no card shows
          a web address. It sits once at section level rather than on every
          card, and it is set small and quiet so it reads as a credit and not
          as part of the weather.
          rel="noreferrer" because the destination has no business knowing
          which screen of this app the reader came from. */}
      <div className="mt-2.5 space-y-0.5">
        {/* WHEN WE LAST LOOKED, in the same words a price card uses, from the
            one definition in DataAgeLine. It sits beside the attribution rather
            than on each card because there is one request behind every card in
            the strip, so one timestamp is true of all of them and seventeen
            copies of it would be noise.
            Dropped on its own if the timestamp is unreadable, which costs a
            reassurance and not the credit below it. */}
        {checkedLine && <p className="text-xs text-ink-500">{checkedLine}</p>}
        <p className="text-xs text-ink-500">
          {t("weather.source")}{" "}
          <a
            href="https://open-meteo.com/"
            target="_blank"
            rel="noreferrer"
            className="underline decoration-ink-300 underline-offset-2 hover:text-ink-700"
          >
            open-meteo.com
          </a>
        </p>
      </div>
    </motion.section>
  );
}

// The horizontal scroll row.
//
// Built as a scroller rather than a grid that collapses, because seventeen
// cards stacked into a phone-width column is several screens of scrolling
// before the section below it. Snapping makes a card land square instead of
// stopping half off the edge, and the card width leaves the next card's edge
// visible, which is what tells a reader there is more to swipe to.
//
// The negative margin and matching padding let the row bleed to both screen
// edges inside a padded page, so the first card starts flush with the heading
// and the last one can scroll fully into view. min-w-0 lets the row shrink
// inside the flex line the arrows share with it: without it a flex item sizes
// to its content, the row grows to seventeen cards wide, and the page itself
// scrolls sideways.
//
// KEYBOARD, AND NOT TRAPPING THE PAGE. tabIndex 0 makes the row focusable, so a
// reader who cannot swipe can tab to it and drive it with the arrow keys, which
// is the browser's own behaviour for a focusable scroll container. role region
// with a name is what makes that stop being a mystery box in a screen reader.
//
// Nothing here listens for wheel or key events and nothing calls
// preventDefault, so vertical scrolling over the strip belongs to the page as
// it always did. overscroll-x-contain stops a horizontal overscroll chaining
// out to the page or triggering a back gesture; it is the x axis only and does
// not touch vertical scrolling.
function ScrollRow({ children, ariaLabel, state, stagger, scrollerRef }) {
  return (
    <div
      ref={scrollerRef}
      className="-mx-4 min-w-0 flex-1 overflow-x-auto overscroll-x-contain px-4 no-scrollbar snap-x snap-mandatory sm:mx-0 sm:px-0"
      aria-label={ariaLabel}
      data-state={state}
      role="region"
      tabIndex={0}
    >
      {/* pb-2 leaves room for the cards' shadow, which a tight overflow box
          would otherwise clip flat along the bottom edge. */}
      <motion.div className="flex gap-3 pb-2" variants={stagger}>
        {children}
      </motion.div>
    </div>
  );
}

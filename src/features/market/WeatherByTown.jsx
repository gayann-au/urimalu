import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { LoadError } from "../../components/ui/LoadError";
import { useUriMotion } from "../../lib/uiMotion";
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
// A card sized to fill the width reads as the whole content, and four towns
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
      // Read by the observer and the dots above, so position is derived from
      // the real DOM order rather than from a second list kept in step.
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

// The dots under the row: which town of five, and a way to jump to any of
// them.
//
// WHY THIS EXISTS. All five cards were present and reachable, but nothing on
// screen said so. A farmer who does not think to swipe sees Madikeri and part
// of Virajpet and reasonably concludes that is the whole list. The peek at the
// right edge hints at it; this states it.
//
// The count is spelled out in words as well as dots, because five dots are a
// convention a reader has to already know, and "1 of 5" is not.
function TownDots({ towns, activeIndex, onSelect }) {
  const { t } = useTranslation();
  if (towns.length < 2) return null;

  return (
    <div className="mt-2 flex items-center gap-2.5">
      <div className="flex items-center gap-1.5">
        {towns.map((name, i) => {
          const active = i === activeIndex;
          return (
            <button
              key={name}
              type="button"
              onClick={() => onSelect(i)}
              aria-label={t("weather.showTown", { town: t(`weather.town.${name}`) })}
              aria-current={active ? "true" : undefined}
              // The visible dot is 6px and 8px; the tap target around it is a
              // full 44px tall so a thumb can hit it. Chilli marks position,
              // never a value: this is which card you are on, and there is no
              // number anywhere near it.
              className="grid h-11 w-4 place-items-center"
            >
              <span
                className={`block rounded-full transition-all ${
                  active ? "h-2 w-2 bg-chilli-600" : "h-1.5 w-1.5 bg-ink-300"
                }`}
              />
            </button>
          );
        })}
      </div>
      <span className="text-xs text-ink-500 tabular-nums">
        {t("weather.positionOf", { current: activeIndex + 1, total: towns.length })}
      </span>
    </div>
  );
}

export function WeatherByTown() {
  const { t } = useTranslation();
  const m = useUriMotion();
  const weatherQ = useKodaguWeather();

  const readings = weatherQ.data;

  const scrollerRef = useRef(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Which card is currently in front, computed from the row's own scroll
  // offset: the card whose resting position is nearest to where the row has
  // been scrolled to. Deterministic in both directions and independent of how
  // the scroll was started, whether by a thumb or by tapping a dot.
  //
  // NOT AN INTERSECTION OBSERVER, though that was the obvious choice and was
  // tried first. Two things ruled it out. It reported the wrong town on
  // backward jumps, because several cards cross a threshold in one callback
  // and the entry order is the browser's, not the row's. And it depends on the
  // page compositing frames, so in a window that is not painting it delivers
  // nothing at all and the indicator silently freezes on the first town. A
  // position control that quietly lies is worse than none.
  //
  // The scroll listener is passive and coalesced to one frame, so a swipe does
  // arithmetic over five offsets once per frame rather than on every event.
  useEffect(() => {
    const root = scrollerRef.current;
    if (!root || !readings) return;

    let frame = 0;

    const update = () => {
      frame = 0;
      const cards = Array.from(root.querySelectorAll("[data-town-index]"));
      if (cards.length === 0) return;

      const x = root.scrollLeft;
      let best = 0;
      let bestDistance = Infinity;
      for (const card of cards) {
        const distance = Math.abs(card.offsetLeft - root.offsetLeft - x);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = Number(card.dataset.townIndex);
        }
      }
      setActiveIndex(best);
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    update();
    root.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      root.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [readings]);

  // Jump the row to a town.
  //
  // scrollTo on the row itself, and instant rather than smooth, both for the
  // same reason. scrollIntoView with behavior "smooth" was measured moving the
  // row forwards and refusing to move it backwards: snap-mandatory re-snaps to
  // the nearest point mid-animation, so a short leftward glide gets pulled
  // back to where it started and tapping dot 1 from dot 3 did nothing.
  // Setting the offset outright lands exactly on a snap point every time, in
  // both directions, which is what a position control has to do.
  function goToTown(index) {
    const root = scrollerRef.current;
    if (!root) return;
    const card = root.querySelector(`[data-town-index="${index}"]`);
    if (!card) return;
    root.scrollTo({ left: card.offsetLeft - root.offsetLeft, behavior: "auto" });
  }

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
            <ScrollRow
              ariaLabel={t("weather.heading")}
              state="populated"
              stagger={m.stagger}
              scrollerRef={scrollerRef}
            >
              {readings.map((reading, i) => (
                <TownCard key={reading.name} reading={reading} index={i}/>
              ))}
            </ScrollRow>
            <TownDots
              towns={readings.map((r) => r.name)}
              activeIndex={activeIndex}
              onSelect={goToTown}
            />
          </div>
        )}
      </div>

      {/* ATTRIBUTION, AND THE ONE LINK IN THIS FEATURE.
          Open-Meteo publishes under CC BY 4.0, which requires crediting the
          source and linking it. That is a licence condition, not a choice, and
          it is the single exception to this feature's rule that no card shows
          a web address. It sits once at section level rather than on all five
          cards, and it is set small and quiet so it reads as a credit and not
          as part of the weather.
          rel="noreferrer" because the destination has no business knowing
          which screen of this app the reader came from. */}
      <p className="mt-2.5 text-xs text-ink-500">
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
    </motion.section>
  );
}

// The horizontal scroll row.
//
// Built as a scroller rather than a grid that collapses, because five cards
// stacked into a phone-width column is a screen and a half of scrolling before
// the section below it. Snapping makes a card land square instead of stopping
// half off the edge, and the card width leaves the next card's edge visible,
// which is what tells a reader there is more to swipe to.
//
// The negative margin and matching padding let the row bleed to both screen
// edges inside a padded page, so the first card starts flush with the heading
// and the last one can scroll fully into view.
function ScrollRow({ children, ariaLabel, state, stagger, scrollerRef }) {
  return (
    <div
      ref={scrollerRef}
      className="-mx-4 overflow-x-auto px-4 no-scrollbar snap-x snap-mandatory"
      aria-label={ariaLabel}
      data-state={state}
    >
      {/* pb-2 leaves room for the cards' shadow, which a tight overflow box
          would otherwise clip flat along the bottom edge. */}
      <motion.div className="flex gap-3 pb-2" variants={stagger}>
        {children}
      </motion.div>
    </div>
  );
}

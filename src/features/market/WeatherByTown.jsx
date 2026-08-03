import { useTranslation } from "react-i18next";
import { LoadError } from "../../components/ui/LoadError";
import {
  weatherCodeKey,
  rainBand,
  rainDotClass,
  formatRainMm,
  formatTemperature,
} from "../../lib/weatherWords";
import { useKodaguWeather, WEATHER_TOWNS } from "./useKodaguWeather";

// SECTION B. Rain and weather, one card per town.
//
// THE POINT OF THIS SECTION IS THE MERGE. Every source that publishes this
// locally splits it up: rainfall on one screen, forecast on another, and the
// current temperature nowhere at all. So a reader who wants to know what it is
// doing in Virajpet right now and how much rain has already fallen there has to
// hold two screens in their head and join them. Here the four facts sit on one
// card, for one town, and the joining is done.
//
// No advice anywhere. This says how warm it is and how much rain fell and is
// coming. It never says whether that is good for drying, good for picking, or
// good for anything else, and it never tells anyone what to do about it.

// One town. Four facts, in the order a reader asks for them: where, what it is
// like now, what has already fallen, what is coming.
function TownCard({ reading }) {
  const { t } = useTranslation();

  const temperature = formatTemperature(reading.temperatureC);
  const conditionKey = weatherCodeKey(reading.weatherCode);

  return (
    <article className="snap-start shrink-0 w-[72%] max-w-[248px] sm:w-[240px] rounded-[18px] border border-ink-200 bg-white p-4 shadow-sm">
      <h3 className="font-display text-base font-extrabold leading-tight tracking-tight text-ink-900">
        {t(`weather.town.${reading.name}`)}
      </h3>

      {/* Temperature and condition. A missing reading drops its own line
          rather than printing a placeholder degree, and an unrecognised WMO
          code drops the words but keeps the number, because the temperature is
          still a fact we can stand behind. */}
      <div className="mt-2.5 min-h-[52px]">
        {temperature ? (
          <p className="text-3xl font-bold leading-none text-ink-900 tabular-nums">
            {t("weather.degrees", { value: temperature })}
          </p>
        ) : (
          <p className="text-sm text-ink-500">{t("weather.noReading")}</p>
        )}
        {conditionKey && (
          <p className="mt-1 text-sm text-ink-600">{t(conditionKey)}</p>
        )}
      </div>

      <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
        <RainLine labelKey="weather.rainPast" mm={reading.rainPast3Mm}/>
        <RainLine labelKey="weather.rainNext" mm={reading.rainNext3Mm}/>
      </div>
    </article>
  );
}

// One rain figure: what window it covers, how many millimetres, and how much
// rain that is in plain words.
//
// The colour lives on the dot and never on the number. See the colour rule in
// weatherWords.js: the band is always carried by words as well as hue, so the
// dot is decoration on a fact that is already fully stated in text, and the mm
// figure stays in ink-900 where it is readable.
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
        <p className="text-xs text-ink-500">{t(labelKey)}</p>
        <p className="text-sm text-ink-500">{t("weather.noRainReading")}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs text-ink-500">{t(labelKey)}</p>
      {/* weather.mm was already in both language files, written for a weather
          card that was never built. Reused rather than duplicated under a new
          name, so there is one "{{value}} mm" string per language. */}
      <p className="text-base font-bold text-ink-900 tabular-nums">
        {t("weather.mm", { value: amount })}
      </p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-600">
        <span
          aria-hidden="true"
          className={`h-2 w-2 shrink-0 rounded-full ${rainDotClass(band.band)}`}
        />
        {t(band.key)}
      </p>
    </div>
  );
}

export function WeatherByTown() {
  const { t } = useTranslation();
  const weatherQ = useKodaguWeather();

  const readings = weatherQ.data;

  return (
    <section className="mt-8" aria-label={t("weather.heading")}>
      <h2 className="font-display text-2xl font-extrabold tracking-tight text-ink-900">
        {t("weather.heading")}
      </h2>
      <p className="mt-1 text-sm text-ink-500">{t("weather.intro")}</p>

      <div className="mt-3">
        {weatherQ.isLoading ? (
          // The skeleton is the same scroll row, so the layout does not jump
          // when the data lands.
          <ScrollRow ariaLabel={t("weather.loading")} state="loading">
            {WEATHER_TOWNS.map((name) => (
              <div
                key={name}
                className="snap-start shrink-0 w-[72%] max-w-[248px] sm:w-[240px] h-52 animate-pulse rounded-[18px] border border-ink-200 bg-white"
              />
            ))}
          </ScrollRow>
        ) : weatherQ.isError ? (
          <div data-state="error">
            <LoadError onRetry={() => weatherQ.refetch()}/>
          </div>
        ) : !readings || readings.length === 0 ? (
          <div
            className="rounded-[18px] border border-ink-200 bg-white p-6 text-sm text-ink-500 shadow-sm"
            data-state="empty"
          >
            {t("weather.empty")}
          </div>
        ) : (
          <ScrollRow ariaLabel={t("weather.heading")} state="populated">
            {readings.map((reading) => (
              <TownCard key={reading.name} reading={reading}/>
            ))}
          </ScrollRow>
        )}
      </div>

      {/* Attribution sits at section level because all five cards come from one
          request to one vendor. The readings are current rather than published
          on a date, so there is no age to state here the way there is under a
          market price; what has to be on screen is whose numbers these are. */}
      <p className="mt-2 text-sm text-ink-500">{t("weather.source")}</p>
    </section>
  );
}

// The horizontal scroll row.
//
// Built as a scroller rather than a grid that collapses, because five cards
// stacked into a phone-width column is a screen and a half of scrolling before
// the section below it. Snapping makes a card land square instead of stopping
// half off the edge, and the 72% card width leaves the next card's edge
// visible, which is what tells a reader there is more to swipe to.
//
// The negative margin and matching padding let the row bleed to both screen
// edges inside a padded page, so the first card starts flush with the heading
// and the last one can scroll fully into view.
function ScrollRow({ children, ariaLabel, state }) {
  return (
    <div
      className="-mx-4 overflow-x-auto px-4 no-scrollbar snap-x snap-mandatory"
      aria-label={ariaLabel}
      data-state={state}
    >
      <div className="flex gap-3 pb-1">{children}</div>
    </div>
  );
}

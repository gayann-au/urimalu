import { TodaysRatesBoard } from "./TodaysRatesBoard";
import { WeatherByTown } from "./WeatherByTown";
import { GlobalBenchmarks } from "./GlobalBenchmarks";

// The container. Order, and nothing else.
//
// It holds no query, no state, no formatting and no rules about numbers. Each
// section below runs its own query and handles its own loading, error and empty
// states, which is what makes them independent: the weather failing cannot
// blank the rates, and the database being unreachable cannot blank the weather.
// A single query here with one shared error state would have coupled all three
// to whichever one broke first.
//
// The order is the argument. Today's rates first, because that is what a farmer
// opens the app for. The weather on their own land second, because it is about
// where they are. The world benchmarks last and smallest, because a farmer in
// Kodagu is not paid in US cents.
//
// This replaces a version that owned a selected crop, read the reader's role to
// pick an opening one, and showed a single price behind a switcher. All of that
// is gone: the board shows all six at once, so there is nothing to select and
// no reason to look at a role.
export function MarketStrip() {
  return (
    <div className="mt-2">
      <TodaysRatesBoard/>
      <WeatherByTown/>
      <GlobalBenchmarks/>
    </div>
  );
}

# Market strip: implementation plan

Status: plan only, no implementation code written.
Branch: `feature/market-data`.
Written: 2026-08-02, against the 14 live rows of `public.market_snapshots`.

This document is the handoff into a fresh session. It assumes the reader has
not seen the conversation that produced it.

---

## 1. What already exists and is not touched

- `public.market_snapshots`, live and populated, 14 rows. RLS on, read policy
  `market_snapshots_read` for `authenticated`.
- Edge function `refresh-market`, repopulating it daily at 06:00 IST via
  pg_cron job 3. Not touched by this work.
- The merchant price list on the home screen. Unchanged. Nothing moves.

No API layer is added. The existing `supabase` client in `src/lib/supabase.js`
queries the table directly, matching every other feature in this codebase.

---

## 2. The live data, and what it forces

The 14 rows, grouped:

| source | crop_key | contract_month | price_min | price_max | unit | source_date |
|---|---|---|---|---|---|---|
| cpa | arabica_parchment | (empty) | 21500 | 22200 | INR/50kg | 2026-06-16 |
| cpa | arabica_cherry | (empty) | 12600 | 14100 | INR/50kg | 2026-06-16 |
| cpa | robusta_parchment | (empty) | 17500 | 18200 | INR/50kg | 2026-06-16 |
| cpa | robusta_cherry | (empty) | 9400 | 10200 | INR/50kg | 2026-06-16 |
| cpa | pepper | (empty) | 697 | null | INR/kg | 2026-06-16 |
| cpa | cardamom | (empty) | 3352 | null | INR/kg | 2026-06-16 |
| coffee_board | ico_other_milds | (empty) | 355.37 | null | USc/lb | 2026-07-29 |
| coffee_board | ico_robustas | (empty) | 186.67 | null | USc/lb | 2026-07-29 |
| coffee_board | ice_arabica | Sept-2026 | 323.05 | null | USc/lb | 2026-07-30 |
| coffee_board | ice_arabica | Dec-2026 | 307.70 | null | USc/lb | 2026-07-30 |
| coffee_board | ice_arabica | Mar-2027 | 299.60 | null | USc/lb | 2026-07-30 |
| coffee_board | liffe_robusta | Sept-2026 | 3780 | null | USD/ton | 2026-07-30 |
| coffee_board | liffe_robusta | Nov-2026 | 3761 | null | USD/ton | 2026-07-30 |
| coffee_board | liffe_robusta | Jan-2027 | 3728 | null | USD/ton | 2026-07-30 |

All 14 are `validation_status = 'ok'`, all have `validation_note = null`.
Zero held rows, zero flagged rows.

Consequences the implementation must absorb:

1. **Three ages on one screen.** CPA 47 days, ICO 4 days, futures 3 days. The
   age treatment has to make that gap readable without the old one reading as
   a fault. See section 7.
2. **Two price shapes.** Only the four coffee CPA rows have a range. Pepper,
   cardamom and every coffee_board row are single values. Both are normal, and
   no card may render "₹697 to ₹null" or a dash where a max would be.
3. **`change_amount` and `change_direction` are never rendered.** They are null
   on all eight coffee_board rows anyway, but the decision is broader than
   that: they are not displayed for any source. See section 3.1. They keep
   being stored.
4. **Cardamom is INR/kg at 3352 and stays that way.** The refresh function
   already overrides the source's own wrong unit field. Nothing downstream
   converts, re-bases, or "corrects" it.
5. **The two curves are not comparable.** Arabica is ~300 USc/lb, robusta is
   ~3700 USD/ton. Different exchange, different unit, different order of
   magnitude. They never share an axis, a scale, a colour ramp, or a card.

---

## 3. Things in the brief I disagree with

Raised here rather than silently absorbed. Four of these change what gets
built and need a decision before implementation starts.

### 3.1 `change_amount` and `change_direction` are not displayed. Decided.

**This is settled, not an open question.** Neither field is rendered anywhere
in this feature. Not with a disclaimer, not in smaller type, not behind a tap.
Both keep being stored by `refresh-market`; only the display is refused.

The reasoning, recorded so a future reader does not "restore" them thinking
it was an oversight:

CPA's `price_diff` is a delta against a previous reading whose date the API
never gives us and the table never stores. We know it is 600 rupees. We do not
know 600 rupees since when. LOCKED B says every number carries its date and
its source, and this is the only number on the screen that cannot.

An earlier draft of this plan proposed showing it with an explicit "the source
does not say over what period". That was rejected, correctly. Two reasons:

- **An exception on the first card weakens the rule everywhere else.** The
  trust argument only works if it is absolute. One dated-number rule with one
  visible exemption is not a rule.
- **The disclaimer does not survive contact with the reader.** It is a
  sentence a farmer on a phone in weak signal will not finish. What survives
  is the number without the caveat, which is the exact failure the caveat was
  meant to prevent.

**When it comes back.** The moment CPA moves off 16 June we will hold two
dated readings of our own, and can compute a change with a real period from
our own history: "₹600 higher than the 16 June reading". That number carries
its date and its source honestly, and it is ours rather than the source's
undated one. That is a later feature, not a prerequisite for this one, and it
needs no schema change because `market_snapshots` already keeps every dated
row.

Practical consequence for implementation: `MarketPriceCard` has no change
line, no direction word, no arrow. The two columns are still fetched by the
hook (they are cheap and their presence documents that we hold them), but
nothing reads them. A reviewer should grep the feature for `change_amount`
and `change_direction` and find zero render sites.

### 3.2 "Like the deals strip at the top of a shopping app" fights LOCKED A

The placement is right and I am keeping it: above the merchant list, first
thing after the seller-lead card. The *metaphor* is the problem. A deals strip
exists to make you want something. Its whole visual grammar (urgency, savings
framing, big contrast colour, motion that draws the eye to a number) is
persuasion, and LOCKED A forbids exactly that.

**What I am building instead:** the same slot, the same prominence, but the
visual language of a noticeboard. Neutral surface, the crop switcher as plain
chips matching the existing crop chips in the By Crop tab, the number large
because it is the subject and not because it is exciting, and dates given the
same typographic weight as the price. No accent colour on any price.

If you specifically wanted the shopping-app *treatment* rather than just the
*position*, say so and we will talk, because I think it contradicts A.

### 3.3 Do not reuse `FreshnessBadge` for data age

`FreshnessBadge` renders `stale` as `text-red-600` with a warning triangle. On
this feature that would put a red warning triangle directly beside a price,
every single day, because CPA is structurally 47 days old and will often be
weeks old. Two problems:

- LOCKED A forbids colour meaning good or bad about a price. Red adjacent to a
  price reads as a verdict on the price no matter what the label says.
- A permanent red triangle trains the user to read the feature as broken. The
  brief itself says a stale source must not look like a broken app.

Also the semantics differ. `freshness.js` measures *hours since a merchant
confirmed their own listing*, and its bands (fresh under 6h, stale over 2
days) are tuned to that. Data age here is measured in days against a third
party's publication date. Same word, different quantity.

**What I am building:** a separate pure helper `dataAge.js` following the same
*shape* as `freshness.js` (returns `{ key, params, band }`, no formatting, no
colour), and a `DataAgeLine` presentational piece that uses ink tones only:
`text-ink-500` for fresh and ageing, `text-ink-700` plus a small clock glyph
for stale. No red, no green, no triangle. The day count is always spelled out.

### 3.4 `ico_arabica` does not exist

The brief says "the ico_arabica / ico_robustas spot indicators". The actual
crop_key is **`ico_other_milds`**, not `ico_arabica`. "Other Milds" is the ICO
group that Indian arabica falls into. Implementation uses `ico_other_milds`.
The user-facing label says "ICO Other Milds, the group Indian arabica is
priced in" rather than silently calling it arabica, because calling it arabica
would be the same class of error as putting robusta under an arabica label.

### 3.5 Two smaller ones, flagged not blocking

**Unit rendering.** "Show the unit exactly as stored, NEVER convert or
re-label" is unambiguous about the quantity basis and I will not touch that.
But `INR/50kg` as literal display text is not readable for someone who reads
Kannada first and has never used an app like this. My reading is that the rule
protects the *basis*, not the *glyphs*. So the plan renders the stored string
verbatim in a small mono token **and** a plain-words gloss beside it in the
active language ("for every 50 kg" / "ಪ್ರತಿ 50 ಕೆ.ಜಿ.ಗೆ"). The stored string is
always on screen, unaltered. If you meant the literal glyphs only, drop the
gloss.

**Contract month ordering.** `contract_month` is a free string ("Sept-2026",
"Dec-2026", "Mar-2027") and there is no sequence column. Alphabetical sorting
gives Dec, Mar, Sept, which is wrong. The UI must parse the label. Note the
source writes "Sept", not the standard "Sep", so the parser must accept both.
Fallback when parsing fails is `created_at` ascending, which reflects the
order the refresh function first inserted the three months. That fallback is
fragile the day a new contract month appears, so the parser is the primary
path. This is a schema gap worth closing later with an ordinal column.

---

## 4. File layout

All new files under `src/features/market/` and `src/features/weather/`, plus
three lib modules, matching the existing feature-folder convention.

```
src/features/market/
  MarketStrip.jsx           container; owns crop selection state; mounts in FeedPage
  CropSwitcher.jsx          six chips, horizontal scroll
  MarketPriceCard.jsx       price, unit, age, attribution. No change line.
  QuantityCalculator.jsx    inside MarketPriceCard
  ForwardCurve.jsx          coffee only; three contract months + ICO spot
  DataAgeLine.jsx           shared age + last-checked presentational piece
  useMarketSnapshots.js     React Query hook + pure selectors

src/features/weather/
  WeatherCard.jsx
  useWeather.js

src/lib/
  marketCrops.js            crop_key catalogue, app-name mapping, unit helpers
  dataAge.js                pure age helper, mirrors freshness.js in shape
  kodaguPlaces.js           seven town coordinates for the weather card
```

Twelve new files, two edited (`FeedPage.jsx`, `queryClient.js`), two i18n
files extended. No existing component is modified beyond the mount.

---

## 5. Where it mounts, and what moves

**Nothing moves.** The strip is inserted, the rest of `FeedPage.jsx` is
untouched.

In `src/features/feed/FeedPage.jsx`, between the `ReadyToSellCard` line
(currently line 103) and the tabs block (currently line 106):

```
  {profile?.role === "FARMER" && <ReadyToSellCard profile={profile}/>}

  {loggedIn && <MarketStrip profile={profile}/>}      <-- inserted here

  {/* Tabs */}
```

Reasoning for that exact slot:

- Above the tabs, not inside one, because the strip is not merchant data and
  not crop-listing data. Putting it inside a tab would hide it half the time.
- Below `ReadyToSellCard` because that card is an action the farmer already
  started and should not be pushed down by reference data.
- The tabs are `sticky top-[64px]`. Inserting a normal-flow block above a
  sticky element does not break the stick; the tabs simply pin once the strip
  scrolls past. No z-index change needed.

**Gating.** `FeedPage` serves logged-out visitors too (`MerchantCardGated`).
The strip renders only when `loggedIn` is true. This is belt and braces: the
RLS policy is `to authenticated`, so an anonymous fetch returns zero rows
anyway, but gating in the component avoids a wasted request and an empty card
on the logged-out feed. The public landing page (`src/features/landing/`) is a
separate route and is not touched at all.

**Role.** Farmers and merchants render the same component with the same hook
and the same numbers. Role affects only two i18n keys (the strip heading and
the calculator's framing line). There is no role branch anywhere near a
number. This is enforceable by review: `profile.role` appears in
`MarketStrip.jsx` only, and only to pick a translation key.

---

## 6. What is reused rather than rebuilt

| Existing thing | How it is used |
|---|---|
| `uiMotion.js` `useUriMotion()` | `m.fadeUp` on each card, `m.stagger` on the card group. No `cardHover`: these cards are not tappable targets as a whole. Reduced-motion handling comes free. |
| `LoadError.jsx` | The error state for the market hook, identical to how `MerchantsTab` and `CropsTab` use it, including the `onRetry` wiring to `refetch()`. |
| `constants.js` `formatINR()` | Every rupee figure. Gives `₹21,500` with `en-IN` grouping and no decimals, matching the merchant cards exactly. |
| `constants.js` `formatValidTill()` | `source_date` and `fetched_at` rendering. It already produces the app's canonical "16 Jun 2026" from a `YYYY-MM-DD` prefix with no timezone shift, which is precisely the shape `source_date` has. Reused verbatim, not reimplemented. |
| `constants.js` `CROP_CATALOG` | Kannada crop labels are lifted from here rather than newly translated, so "ರೊಬಸ್ಟಾ ಚೆರಿ" reads identically in the market strip and the listing autocomplete. |
| `constants.js` `DELIVERY_POINTS` | The seven Kodagu towns that get weather coordinates. See section 10. |
| `RateCard.jsx` | Pattern source, not imported. The card shell (`bg-white rounded-[18px] border border-ink-200 shadow-sm p-6`), the icon box (`h-11 w-11 rounded-2xl bg-crop-50 text-crop-600`), the price hero (`text-3xl font-extrabold tabular-nums`), the `bg-paper-2 rounded-2xl p-4` inset used by `BagTotals`, and the chip styling are all copied so the strip looks native. |
| `FeedPage.jsx` chip styling | `CropSwitcher` reuses the By Crop tab's chip classes verbatim, including `overflow-x-auto no-scrollbar scroll-fade-right`. |
| `freshness.js` | **Shape only, not the function.** See 3.3. `dataAge.js` mirrors its pure-helper contract so the two feel like siblings. |
| `FreshnessBadge.jsx` | **Not used.** See 3.3. |
| `queryClient.js` `qk` | Extended with two keys, not replaced. |

Two `qk` additions:

```js
marketSnapshots: ["market_snapshots", "all"],
weather: (lat, lon) => ["weather", lat, lon],
```

---

## 7. Age treatment

The single most important thing on the card, per the brief, and the thing most
likely to be got wrong.

**Two distinct facts, never merged:**

- **How old the data is.** `source_date`, the day the source published. Shown
  as both the absolute date and the day count.
- **When we last looked.** `fetched_at`, the day our job last ran. Shown
  separately and more quietly.

The distinction is the answer to "a stale source must not look like a broken
app". A 47-day-old price checked this morning is a working app reporting an
old fact. Both halves must be visible for that to land.

`dataAge.js`, pure, no React, no i18n:

```
ageInDays(sourceDate, now)        integer days, floor, never negative
dataAge(sourceDate, now)          { days, band, key, params }
  band "fresh"   0 to 2 days
  band "ageing"  3 to 14 days
  band "stale"   15 days and over
```

Bands come from the brief. The day count is always rendered; the band only
selects wording and weight, never replaces the number.

Rendering, in `DataAgeLine.jsx`:

```
Priced 16 Jun 2026, 47 days ago            <- ink-700, clock glyph, stale
Coorg Planters' Association                 <- ink-500
We checked this morning, 2 Aug 2026         <- ink-500, smaller
```

versus the futures card a few inches below:

```
Priced 30 Jul 2026, 3 days ago              <- ink-500, no glyph, fresh
Coffee Board of India
We checked this morning, 2 Aug 2026
```

The contrast reads off the day count and the glyph, not off colour. No red, no
green, no amber anywhere in this feature.

**"We checked this morning"** is used when `fetched_at` is today, falling back
to the absolute date otherwise. This is the one place a relative phrase beats
a date, because it is the sentence that says the app is alive.

---

## 8. The data hook

`src/features/market/useMarketSnapshots.js`. One query, 14 rows, no pagination
concern, no realtime.

```js
async function fetchMarketSnapshots() {
  const { data, error } = await supabase
    .from("market_snapshots")
    .select(
      "source, crop_key, display_name, price_min, price_max, unit, " +
      "contract_month, source_date, change_amount, change_direction, " +
      "validation_status, validation_note, fetched_at, created_at"
    )
    .neq("validation_status", "held")
    .order("source_date", { ascending: false });
  if (error) throw error;
  return data || [];
}

export function useMarketSnapshots() {
  const { isAuthenticated } = useAuth();
  return useQuery({
    queryKey: qk.marketSnapshots,
    enabled: isAuthenticated,
    queryFn: fetchMarketSnapshots,
    staleTime: 15 * 60_000,
  });
}
```

Notes on that shape:

- **Explicit column list, no `select("*")`.** Matches the house rule visible in
  `useFeed.js` and `constants.js`. `raw` and `app_crop_names` are deliberately
  not fetched: `raw` is a large jsonb audit payload that no screen needs, and
  `app_crop_names` is null on every row (see 9.1).
- **`.neq("validation_status", "held")`** pushes the non-negotiable read rule
  into the database. A second client-side filter in the selector repeats it,
  because "must never reach a screen" deserves two locks.
- **`staleTime` 15 minutes**, overriding the 30-second global default. The
  source refreshes once a day at 06:00 IST. Refetching every 30 seconds on a
  weak hill connection would be pure waste.
- **`enabled: isAuthenticated`** so no request fires for logged-out visitors.

Pure selectors in the same file, testable without React:

```
latestPerKey(rows)
  Reduce to the newest source_date per (source, crop_key, contract_month).
  Ties broken by fetched_at descending, then created_at descending.
  This is the non-negotiable read rule.

cpaRowForCrop(rows, cropKey)          -> row | null
curveRowsForCrop(rows, cropKey)       -> row[] ordered by contract month
spotRowForCrop(rows, cropKey)         -> row | null
isFlagged(row)                        -> boolean
```

`contractMonthOrder(label)` lives in `marketCrops.js` and parses
`Sept-2026` / `Dec-2026` / `Mar-2027` into a sortable integer
(`year * 12 + monthIndex`), accepting both `Sep` and `Sept`. Unparseable
labels sort last, by `created_at` ascending.

**Flagged rows.** Zero exist today, so this path has never been rendered and
must be treated as unproven. A flagged row shows its number normally and
renders `validation_note` verbatim beneath it in an inset
(`bg-paper-2 rounded-2xl p-3 text-xs text-ink-700`) prefixed with a fixed
translated label. The note is never truncated, never behind a tooltip, never
in a title attribute. `validation_note` is written by our own edge function,
not by the third party, so it is trusted text, but it is English only; the
Kannada UI shows the translated prefix plus the English note. Flagged is
**not** styled as an error and does not use warning colour, because a flagged
row is a fact with a caveat, not a failure.

---

## 9. Crop switcher

Six chips: `arabica_parchment`, `arabica_cherry`, `robusta_parchment`,
`robusta_cherry`, `pepper`, `cardamom`. Selection is local component state,
not persisted, not in the URL.

### 9.1 Defaulting: the problem the brief did not know about

The brief offers `crop_follows` or the user's own listings as the default
source. Both store **app crop names** (`"Robusta Cherry"`, `"Black Pepper
Grade 1"`) from `CROP_CATALOG`. `market_snapshots` stores **market crop keys**
(`robusta_cherry`, `pepper`). The column built to bridge them,
`app_crop_names`, is **null on all 14 rows** and was deliberately left unset
when the table was created.

So there is no mapping in the database. One has to exist somewhere.

**Decision:** a client-side map in `src/lib/marketCrops.js`, single source of
truth, with a comment pointing at the eventual backfill.

```js
export const MARKET_CROPS = [
  { key: "robusta_cherry",    appNames: ["Robusta Cherry", "Robusta Cherry EP"] },
  { key: "robusta_parchment", appNames: ["Robusta Parchment"] },
  { key: "arabica_cherry",    appNames: ["Arabica Cherry", "Arabica Cherry EP"] },
  { key: "arabica_parchment", appNames: ["Arabica Parchment"] },
  { key: "pepper",            appNames: ["Black Pepper Grade 1", "Black Pepper Grade 2"] },
  { key: "cardamom",          appNames: ["Cardamom"] },
];
```

`Light Berries` and `Arecanut` exist in `CROP_CATALOG` with no market
equivalent, and are correctly absent.

When `app_crop_names` is eventually backfilled, this constant is deleted and
the mapping read from the row. Until then, having it in two places would
guarantee drift, so it lives in exactly one.

### 9.2 Default selection order

1. **Merchant**: the crop_key whose `appNames` most often appear in that
   merchant's own active listings. A merchant's screen should open on what
   they actually trade.
2. **Farmer**: the crop_key matching their most recently created `crop_follows`
   row. Follows are an explicit statement of interest and are cheap to read
   (`useMyCropFollows` already exists and is already scoped by RLS).
3. **Fallback**: `robusta_cherry`, per the brief. Also used when the follow or
   listing names map to nothing.

Chosen this way because a follow is a deliberate act, whereas a listing is a
business record that may cover crops the merchant barely handles. For
merchants the reverse is true, hence the split.

The default is computed once on mount and never re-applied, so a user who taps
a different chip is not yanked back when their follows refetch.

---

## 10. Weather card

Separate card, below the market card. The weather failing must never blank the
price card, and vice versa. They share no state and no query.

`useWeather.js` calls Open-Meteo client side via React Query. Nothing is
stored. `staleTime` 30 minutes, `retry: 1`.

```
https://api.open-meteo.com/v1/forecast
  ?latitude={lat}&longitude={lon}
  &current=temperature_2m,relative_humidity_2m,precipitation,weather_code
  &daily=precipitation_sum&past_days=3&forecast_days=3&timezone=Asia%2FKolkata
```

`past_days=3` is in the brief's URL and the response therefore carries six
daily entries. Only today and the next two are rendered; the three past days
are ignored. Worth stating so the next reader does not think the slice is a
bug.

### 10.1 What location fields actually exist. Checked.

Checked against the schema rather than assumed. Result, recorded so this is
not re-investigated later:

- **There is no `taluk` column and no `location` column** on `users`.
- **There is a `town` column** (free text, capped at 100 chars by the
  `users_town_len` constraint in
  `20260702000001_security_constraints.sql:54`) and a **`district`** column.
  Both are in `USER_COLUMNS_PUBLIC` (`20260612000001_users_select_lockdown.sql:107`)
  and both are already on `profile` with no extra query.
- **`town` is collected from merchants only.** `OnboardingFarmerForm.jsx`
  collects full name, phone and district. It never asks for a town. So for
  farmers, who are the primary audience for this card, `town` is null.
- **`district` is too coarse to use.** `DISTRICTS` is
  `["Kodagu", "Chikmagalur", "Hassan", "Other"]`. A district is not a point,
  and two of the four values are not even Kodagu.

So the honest summary is: **a usable location field exists, but only for
merchants.** Most farmers will have nothing.

**Decision.** Use `town` when it is there and recognisable, fall back to
Madikeri otherwise, and always label the place the numbers are actually for.

1. `profile.town` case-insensitively matches one of the seven
   `DELIVERY_POINTS` (Virajpet, Gonikoppal, Kushalnagar, Madikeri, Somwarpet,
   Ponnampet, Suntikoppa) -> use that town's coordinates, label it by name.
2. Anything else, including null, empty, unmatched free text, or a town
   outside Kodagu -> use Madikeri's coordinates (12.4208, 75.7397) and label
   it **Madikeri**, plus the `weather.fallbackNote` line.

The label always names the place the numbers are for, never the user's own
location. A farmer in Virajpet is told they are looking at Madikeri weather.
We never print a user's town over coordinates we did not use, never
interpolate a coordinate for an unrecognised town, and never imply the reading
is local to them when it is the fallback.

Expect the fallback to be the common path. That is correct behaviour, not a
gap to close by guessing. If per-farmer weather is wanted later, the fix is to
collect a taluk during farmer onboarding, which is a separate piece of work
with its own consent and validation questions.

`kodaguPlaces.js` holds the seven coordinate pairs, hand-checked, with a
comment that they are approximate town centres.

### 10.2 WMO weather_code

Mapped to plain words in both languages, grouped so the user gets a phrase
they recognise rather than a meteorological term. Full mapping in section 11.
Any code outside the map falls back to a neutral "Weather not described"
string rather than printing the raw integer.

---

## 11. i18n keys

Added to `src/i18n/en.json` and `src/i18n/kn.json`. Two new top-level
namespaces, `market` and `weather`, matching the existing `feed` / `card` /
`freshness` structure.

> **Kannada caveat, stated plainly.** The Kannada below is my own and has not
> been reviewed by a native speaker. The six crop names are lifted verbatim
> from `CROP_CATALOG` and are safe. The rest, especially the calculator
> disclaimer and the futures explanation, should be read by someone fluent
> before this ships to farmers. Do not treat this column as final copy.

### market

| key | en | kn |
|---|---|---|
| `market.heading` | Market reference prices | ಮಾರುಕಟ್ಟೆ ಉಲ್ಲೇಖ ದರಗಳು |
| `market.intro` | Published by outside bodies. Not a merchant offer. | ಹೊರಗಿನ ಸಂಸ್ಥೆಗಳು ಪ್ರಕಟಿಸಿದ ದರಗಳು. ಇದು ವ್ಯಾಪಾರಿಯ ದರವಲ್ಲ. |
| `market.pickCrop` | Choose a crop | ಬೆಳೆ ಆಯ್ಕೆ ಮಾಡಿ |
| `market.crop.arabica_parchment` | Arabica Parchment | ಅರೇಬಿಕಾ ಪಾರ್ಚ್‌ಮೆಂಟ್ |
| `market.crop.arabica_cherry` | Arabica Cherry | ಅರೇಬಿಕಾ ಚೆರಿ |
| `market.crop.robusta_parchment` | Robusta Parchment | ರೊಬಸ್ಟಾ ಪಾರ್ಚ್‌ಮೆಂಟ್ |
| `market.crop.robusta_cherry` | Robusta Cherry | ರೊಬಸ್ಟಾ ಚೆರಿ |
| `market.crop.pepper` | Pepper | ಕರಿಮೆಣಸು |
| `market.crop.cardamom` | Cardamom | ಏಲಕ್ಕಿ |
| `market.priceRange` | {{min}} to {{max}} | {{min}} ರಿಂದ {{max}} |
| `market.unitGloss.per50kg` | for every 50 kg | ಪ್ರತಿ 50 ಕೆ.ಜಿ.ಗೆ |
| `market.unitGloss.perKg` | for every kg | ಪ್ರತಿ ಕೆ.ಜಿ.ಗೆ |
| `market.unitGloss.uscLb` | US cents for every pound | ಪ್ರತಿ ಪೌಂಡ್‌ಗೆ ಅಮೆರಿಕನ್ ಸೆಂಟ್ |
| `market.unitGloss.usdTon` | US dollars for every tonne | ಪ್ರತಿ ಟನ್‌ಗೆ ಅಮೆರಿಕನ್ ಡಾಲರ್ |
| `market.pricedOn` | Priced {{date}} | ದರ ನಿಗದಿ {{date}} |
| `market.ageDays` | {{count}} days ago | {{count}} ದಿನಗಳ ಹಿಂದೆ |
| `market.ageDay` | {{count}} day ago | {{count}} ದಿನದ ಹಿಂದೆ |
| `market.ageToday` | today | ಇಂದು |
| `market.checkedToday` | We checked this morning, {{date}} | ನಾವು ಇಂದು ಬೆಳಿಗ್ಗೆ ಪರಿಶೀಲಿಸಿದ್ದೇವೆ, {{date}} |
| `market.checkedOn` | We last checked {{date}} | ನಾವು ಕೊನೆಯ ಬಾರಿ ಪರಿಶೀಲಿಸಿದ್ದು {{date}} |
| `market.source.cpa` | Coorg Planters' Association | ಕೊಡಗು ಪ್ಲಾಂಟರ್ಸ್ ಅಸೋಸಿಯೇಷನ್ |
| `market.source.coffeeBoard` | Coffee Board of India | ಭಾರತೀಯ ಕಾಫಿ ಮಂಡಳಿ |
| `market.flaggedLabel` | Note from our check: | ನಮ್ಮ ಪರಿಶೀಲನೆಯ ಟಿಪ್ಪಣಿ: |
| `market.calc.heading` | Work out a total | ಒಟ್ಟು ಮೊತ್ತ ಲೆಕ್ಕ ಹಾಕಿ |
| `market.calc.bagsLabel` | Number of 50 kg bags | 50 ಕೆ.ಜಿ. ಚೀಲಗಳ ಸಂಖ್ಯೆ |
| `market.calc.kgLabel` | Number of kilos | ಕೆ.ಜಿ. ಸಂಖ್ಯೆ |
| `market.calc.totalRange` | {{min}} to {{max}} | {{min}} ರಿಂದ {{max}} |
| `market.calc.boardValue` | Board value | ಮಂಡಳಿ ದರದ ಮೌಲ್ಯ |
| `market.calc.notWhatYouGet` | This is the board rate multiplied out. Moisture, outturn and grade deductions are not included, so a buyer's figure will differ. | ಇದು ಮಂಡಳಿ ದರವನ್ನು ಗುಣಿಸಿದ ಮೊತ್ತ. ತೇವಾಂಶ, ಔಟ್‌ಟರ್ನ್ ಮತ್ತು ಗ್ರೇಡ್ ಕಡಿತಗಳು ಇದರಲ್ಲಿ ಇಲ್ಲ, ಆದ್ದರಿಂದ ಖರೀದಿದಾರರ ಮೊತ್ತ ಬೇರೆಯಾಗಿರುತ್ತದೆ. |
| `market.curve.heading` | Prices for future months | ಮುಂದಿನ ತಿಂಗಳುಗಳ ದರಗಳು |
| `market.curve.explain` | These are the prices buyers on a world exchange are agreeing today for coffee to be delivered in these months. They are not Kodagu prices and not an offer to you. | ಈ ತಿಂಗಳುಗಳಲ್ಲಿ ತಲುಪಿಸಬೇಕಾದ ಕಾಫಿಗೆ ಜಾಗತಿಕ ವಿನಿಮಯ ಕೇಂದ್ರದ ಖರೀದಿದಾರರು ಇಂದು ಒಪ್ಪಿಕೊಂಡಿರುವ ದರಗಳು ಇವು. ಇವು ಕೊಡಗಿನ ದರಗಳಲ್ಲ ಮತ್ತು ನಿಮಗೆ ನೀಡಿದ ದರವೂ ಅಲ್ಲ. |
| `market.curve.exchange.ice` | ICE, New York | ಐಸಿಇ, ನ್ಯೂಯಾರ್ಕ್ |
| `market.curve.exchange.liffe` | LIFFE, London | ಲಿಫೆ, ಲಂಡನ್ |
| `market.spot.heading` | Today's world indicator | ಇಂದಿನ ಜಾಗತಿಕ ಸೂಚ್ಯಂಕ |
| `market.spot.otherMilds` | ICO Other Milds, the group Indian arabica is priced in | ಐಸಿಒ ಅದರ್ ಮೈಲ್ಡ್ಸ್, ಭಾರತೀಯ ಅರೇಬಿಕಾ ಸೇರುವ ಗುಂಪು |
| `market.spot.robustas` | ICO Robustas | ಐಸಿಒ ರೊಬಸ್ಟಾಸ್ |
| `market.loading` | Loading market prices | ಮಾರುಕಟ್ಟೆ ದರಗಳು ಬರುತ್ತಿವೆ |
| `market.emptyAll` | No market prices have arrived yet. They are collected once each morning. | ಇನ್ನೂ ಯಾವುದೇ ಮಾರುಕಟ್ಟೆ ದರ ಬಂದಿಲ್ಲ. ಪ್ರತಿ ಬೆಳಿಗ್ಗೆ ಒಮ್ಮೆ ಇವನ್ನು ಸಂಗ್ರಹಿಸಲಾಗುತ್ತದೆ. |
| `market.emptyCrop` | No price has arrived for {{crop}} yet. | {{crop}} ಗೆ ಇನ್ನೂ ದರ ಬಂದಿಲ್ಲ. |
| `market.emptyCurve` | No future month prices have arrived yet. | ಮುಂದಿನ ತಿಂಗಳುಗಳ ದರಗಳು ಇನ್ನೂ ಬಂದಿಲ್ಲ. |

### weather

| key | en | kn |
|---|---|---|
| `weather.heading` | Weather | ಹವಾಮಾನ |
| `weather.fallbackNote` | Showing Madikeri | ಮಡಿಕೇರಿಯ ಮಾಹಿತಿ ತೋರಿಸಲಾಗಿದೆ |
| `weather.temp` | Temperature | ಉಷ್ಣಾಂಶ |
| `weather.humidity` | Humidity | ತೇವಾಂಶ |
| `weather.rainNow` | Rain right now | ಈಗ ಮಳೆ |
| `weather.rainToday` | Rain today | ಇಂದಿನ ಮಳೆ |
| `weather.rainTomorrow` | Rain tomorrow | ನಾಳಿನ ಮಳೆ |
| `weather.rainDayAfter` | Rain day after | ನಾಳಿದ್ದಿನ ಮಳೆ |
| `weather.mm` | {{value}} mm | {{value}} ಮಿ.ಮೀ. |
| `weather.noRain` | None expected | ನಿರೀಕ್ಷೆ ಇಲ್ಲ |
| `weather.loading` | Loading weather | ಹವಾಮಾನ ಬರುತ್ತಿದೆ |
| `weather.error` | Weather could not be loaded | ಹವಾಮಾನ ಮಾಹಿತಿ ಸಿಗಲಿಲ್ಲ |
| `weather.code.clear` | Clear sky | ಸ್ವಚ್ಛ ಆಕಾಶ |
| `weather.code.mainlyClear` | Mostly clear | ಬಹುತೇಕ ಸ್ವಚ್ಛ |
| `weather.code.partlyCloudy` | Partly cloudy | ಭಾಗಶಃ ಮೋಡ |
| `weather.code.overcast` | Cloudy | ಮೋಡ ಕವಿದಿದೆ |
| `weather.code.fog` | Fog | ಮಂಜು |
| `weather.code.drizzle` | Light drizzle | ತುಂತುರು ಮಳೆ |
| `weather.code.rain` | Rain | ಮಳೆ |
| `weather.code.heavyRain` | Heavy rain | ಭಾರೀ ಮಳೆ |
| `weather.code.showers` | Showers | ಸೋನೆ ಮಳೆ |
| `weather.code.thunderstorm` | Thunderstorm | ಗುಡುಗು ಸಹಿತ ಮಳೆ |
| `weather.code.unknown` | Weather not described | ಹವಾಮಾನ ವಿವರಿಸಿಲ್ಲ |

WMO code groups: `0` clear; `1` mainlyClear; `2` partlyCloudy; `3` overcast;
`45,48` fog; `51,53,55,56,57` drizzle; `61,63,66,67` rain; `65` heavyRain;
`80,81,82` showers; `95,96,99` thunderstorm; anything else `unknown`.

---

## 12. Loading, empty and error states

Per the brief these matter as much as the happy path. Weak hill signal is the
design assumption, so every card states which of the three it is in and never
collapses to nothing.

### Market card

- **Loading.** Skeleton in the card's own footprint, reusing the existing
  idiom: `bg-white rounded-[18px] border border-ink-200 shadow-sm p-6
  animate-pulse` at a fixed height, with the crop chips already rendered and
  tappable (they are static and do not need the query). The heading and the
  intro line render immediately. The user sees the feature exists while it
  loads, not a grey slab.
- **Error.** `<LoadError onRetry={() => q.refetch()} />` inside the card shell,
  identical to `MerchantsTab`. The heading stays. The crop chips stay.
- **Empty, all rows.** Query succeeded, zero rows. `market.emptyAll`, which
  says the prices are collected once each morning. That sentence is doing real
  work: it tells the user the app is fine and when to come back.
- **Empty, this crop.** Rows exist but none for the selected crop_key.
  `market.emptyCrop` naming the crop. Other chips stay tappable so the user
  can move on.

### Forward curve

- Hidden entirely for `pepper` and `cardamom`. Not an empty state, not a
  disabled state, not a "no data for this crop" message. The card does not
  exist for those crops. Showing a coffee futures card under cardamom would be
  a category error.
- **Loading** shares the market card's query, so it shares its skeleton.
- **Empty.** Coffee crop selected, curve rows missing. `market.emptyCurve`.
- **Partial.** Fewer than three months present. Render what exists. Never pad
  to three with placeholders.

### Weather card

- Independent query. Its states never affect the market card.
- **Loading.** Skeleton at the card's height, heading and place label already
  rendered.
- **Error or offline.** `weather.error` plus a retry button. Explicitly not a
  blank card, per the brief. Open-Meteo has no key and no auth, so the
  realistic failure is the network, which is exactly the case that matters.
- **Empty.** Not reachable in practice; a 200 always carries `current`. If
  `current` is missing the card renders the error state rather than blank
  fields.

---

## 13. LOCKED A and LOCKED B compliance

How each is enforced, so a reviewer can check rather than trust.

**A, no advice.**

- No sentence in section 11 recommends an action. Grep the i18n additions for
  "should", "best", "good time", "now is", "consider", "better" and expect
  zero hits.
- No arrow glyphs anywhere in the feature. There is nothing for one to point
  at: `change_direction` is not rendered in any form, as a glyph or as a word.
- No colour carries meaning about a price. The whole feature uses `ink`
  neutrals plus the existing `crop-50/600` icon box. No red, no green, no
  amber, no accent on any number.
- The forward curve is presented as three dated facts, not a trend line. No
  sparkline, no slope, no connecting stroke between the three months, because
  a downward line from 323 to 299 is a visual argument.
- Nothing is sorted or highlighted by attractiveness. Contract months sort
  chronologically, crops sort in a fixed catalogue order.

**B, every number carries its date and its source.**

- `DataAgeLine` is rendered by every card that shows a number, and takes
  `sourceDate` and `sourceKey` as required props. A card that renders a price
  without it fails its own component contract.
- The calculator's output inherits the price card's date and source, and
  repeats the source line beneath the total, because a computed total is still
  a number.
- The one number that could not satisfy B, `change_amount`, is not rendered at
  all. See section 3.1. There is no exemption anywhere in this feature, which
  is what makes the rule enforceable.
- Weather numbers carry the place, the observation time from the API response,
  and Open-Meteo as the source. The place is the place the coordinates are
  for, never the user's own town unless those coincide.

---

## 14. Build order

1. `marketCrops.js`, `dataAge.js`, `kodaguPlaces.js`. Pure, no React, testable
   immediately.
2. `useMarketSnapshots.js` plus the `qk` additions. Verify against the real 14
   rows before any UI exists.
3. i18n keys into both files. Doing this before the components stops English
   from being hardcoded "temporarily".
4. `DataAgeLine.jsx`, then `MarketPriceCard.jsx`, then `CropSwitcher.jsx`,
   then `MarketStrip.jsx`. Mount it. Confirm the strip renders for a logged-in
   farmer and is absent for a logged-out visitor.
5. `QuantityCalculator.jsx`.
6. `ForwardCurve.jsx`.
7. `useWeather.js`, `WeatherCard.jsx`.
8. Loading, empty and error states for each, deliberately, by forcing each
   state rather than assuming.

Build after each of steps 4, 6 and 7 to confirm it compiles, per CLAUDE.md.

---

## 15. `app_crop_names` backfill

**Not a prerequisite. A separate step after the UI ships.**

The column is null on all 14 rows. The client-side `MARKET_CROPS` map in
`src/lib/marketCrops.js` (section 9.1) covers the crop_key to app-crop-name
mapping completely, and the feature ships and works with the column untouched.
Nothing in the build order waits on it.

When it is done, later:

1. Populate `app_crop_names` for the six CPA crop_keys with the same arrays
   `MARKET_CROPS` holds today. Per the database rules in `CLAUDE.md` this is
   written as SQL, shown statement by statement, run by the owner in the
   Supabase SQL editor, and only then committed as a migration file. It is an
   `UPDATE` against a live table, so it gets the same care as any other.
2. Decide whether `refresh-market` should maintain it going forward, which
   means the map moves into the edge function.
3. Only then delete `MARKET_CROPS` and read the mapping from the row.

Steps 1 to 3 happen together or not at all. The failure mode to avoid is the
map existing in both the client and the column at once, drifting silently,
with no way to tell which one a given screen used. Until step 3 lands, the
client map is the single source of truth and the column stays null on purpose.

The coffee_board crop_keys (`ice_arabica`, `liffe_robusta`, `ico_other_milds`,
`ico_robustas`) are exchange instruments, not crops this app lists. They have
no app crop names and their `app_crop_names` stays null permanently.

---

## 16. Open questions

1. **Unit rendering.** Section 3.5. Stored string plus a plain-words gloss, or
   the stored string alone?
2. **Kannada review.** Section 11. Who checks the copy before it reaches
   farmers?

Question 1 blocks build step 4. Question 2 blocks release, not development.

Settled and not to be reopened without a decision: `change_amount` and
`change_direction` are never rendered (3.1), the strip is a noticeboard and
not a deals strip (3.2), `FreshnessBadge` is not reused (3.3), the ICO key is
`ico_other_milds` (3.4), and the weather card falls back to a labelled
Madikeri (10.1).

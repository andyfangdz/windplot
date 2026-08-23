# AGENTS.md — AI Agent Guide for WindPlot

This document provides comprehensive guidance for AI agents working on this codebase. It covers architecture, common workflows, critical constraints, and verification patterns.

> **Keep this document up to date.** When making structural changes—adding files, renaming modules, changing data flow, or modifying key abstractions—update this document to reflect those changes.

---

## Quick Reference

| Task | Key Files | Verification |
|------|-----------|--------------|
| Add data source | `src/app/actions.ts` | `npm run dev` → check console |
| Add airport | `scripts/update-nasr.mjs` or manual edit | Navigate to new ICAO URL |
| Add chart component | `src/components/` | Visual inspection |
| Modify weather fetch | `src/app/actions.ts` | Check network tab, console |
| Change favorites | `src/app/actions.ts` (FAVORITE_ICAOS) | Reload page |
| Modify forecast fetch | `src/app/actions.ts`, `src/lib/nbm-parser.ts` | Toggle to Forecast view |
| Modify NBM parser | `src/lib/nbm-parser.ts` | `npm run test:run` |
| Modify nearby airports | `src/components/NearbyAirports.tsx`, `src/app/actions.ts` | Visual inspection, toggle Obs/Forecast |
| Modify cloud/visibility display | `src/components/CurrentConditions.tsx`, `src/components/ForecastConditions.tsx` | Visual inspection on VFR + IFR airports |
| Modify sky history plot | `src/components/ConditionsHistory.tsx` | Visual inspection on an airport whose ceiling changed |
| Modify observation source handling | `src/lib/conditions.ts` | `npm run test:run` |
| Modify weather derivations | `src/lib/weather.ts` | `npm run test:run` |
| Modify touch interactions | `src/lib/useHorizontalSwipeLock.ts` | Test on mobile/touch device |

---

## Project Overview

**WindPlot** is a Next.js 16 aviation weather visualization app. It fetches real-time wind observations from the Synoptic Data API and displays wind speed, gusts, and direction with runway overlays for crosswind assessment.

### Tech Stack
- **Framework**: Next.js 16 (App Router, React 19)
- **Charts**: Chart.js + react-chartjs-2 (speed chart), Canvas API (direction radar)
- **Weather API**: Synoptic Data API (5-minute AWOS observations)
- **METAR**: Aviation Weather Center API
- **Forecast API**: NOAA National Blend of Models (NBM) via NOMADS text bulletins
- **Timezone**: @photostructure/tz-lookup (lat/lon to IANA timezone lookup)
- **Telemetry**: Datadog Browser RUM (`@datadog/browser-rum`, env-gated)
- **Styling**: Tailwind CSS 4
- **Airport Data**: FAA NASR subscription (bundled JSON)

---

## Architecture

### Directory Structure

```
src/
├── app/
│   ├── page.tsx              # Root page + legacy query route compatibility
│   ├── WindPlotPage.tsx      # Shared server page loader for all routes
│   ├── [icao]/[mode]/[duration]/page.tsx # Path-routed entry: /KCDW/observation/4h
│   ├── actions.ts            # Server actions: wind data, airport search, METAR, forecast
│   ├── layout.tsx            # Root layout
│   ├── DatadogRumInit.tsx    # Client-only Datadog RUM bootstrap (env-gated)
│   └── nbm-parser.test.ts   # NBM parser unit tests (vitest)
├── components/
│   ├── WindPlot.tsx          # Main client component, state management
│   ├── WindSpeedChart.tsx    # Time series (Chart.js Line)
│   ├── WindDirectionChart.tsx # Polar radar (Canvas API)
│   ├── RunwayWindTable.tsx   # Crosswind/headwind breakdown
│   ├── ForecastChart.tsx     # NBM forecast time series with synced selection
│   ├── ForecastDirectionChart.tsx # NBM forecast polar radar with synced selection
│   ├── ForecastWindTable.tsx # Forecast crosswind/headwind with time picker
│   ├── AirportSelector.tsx   # Search + quick-select + forecast duration limits
│   ├── NearbyAirports.tsx    # Nearby airports table with METAR wind + flight category
│   ├── CurrentConditions.tsx # Clouds/visibility/temp/altimeter/density alt (5-min or METAR)
│   ├── ConditionsHistory.tsx # Time-height plot of cloud layers + ceiling/visibility trend
│   ├── ForecastConditions.tsx # NBM ceiling & visibility forecast with synced selection
│   ├── SkyDiagram.tsx        # Cloud layer stack visualization (pure DOM)
│   ├── FlightCategoryBadge.tsx # VFR/MVFR/IFR/LIFR badge
│   ├── StatTile.tsx          # Shared labelled-value tile
│   └── SettingsModal.tsx     # Runway surface filter settings
├── lib/
│   ├── types.ts              # TypeScript interfaces
│   ├── nbm-parser.ts         # NBM text bulletin parser (NBH + NBS products)
│   ├── weather.ts            # Cloud/visibility/flight-category/derived-value utilities
│   ├── conditions.ts         # Normalizes Synoptic 5-min + METAR into one shape
│   ├── cache.ts              # Staleness/cache utilities
│   ├── windplot-route.ts     # URL route parsing/building helpers
│   ├── useHorizontalSwipeLock.ts # Touch gesture hook: prevents scroll on horizontal swipe
│   ├── airports.ts           # Airport utilities (unused, data in JSON)
│   ├── weather.test.ts       # Weather utility unit tests (vitest)
│   ├── conditions.test.ts    # Source-normalization unit tests (vitest)
│   ├── airports-data.json    # 4,450 US airports from NASR
│   └── spatial-index.bin     # Pre-built k-d tree for nearby queries
scripts/
└── update-nasr.mjs           # Fetch/regenerate airport data
data/
└── (NASR downloads cached here)
```

### Data Flow

```
[Synoptic API]      [Aviation Weather API]      [NOAA NOMADS]
      ↓                      ↓                       ↓
getWindData()          getMetar()            getNbmForecast()
      ↓               getMetarBatch()        (NBH 24h / NBS 72h)
      └──────────┬───────────┘                       │
                 ↓                                   │
      getAirportFullData() (parallel fetch)          │
                 ↓                                   │
      WindPlotPage.tsx (server loader used by root + path routes) │
                 ↓                                   │
      WindPlot (client state holder) ←───────────────┘
                 ↓                   (on-demand fetch when viewing forecast)
        viewMode toggle
         /          \
   observations    forecast
        ↓          ↓      ↘
   ┌────┼────┐   range    forecastHoursLimit
   ↓    ↓    ↓  (24/72)   (client-side filter)
Wind  Wind  Runway   ↓
Speed Dir   Wind   ┌────┼────┐
Chart Chart Table  ↓    ↓    ↓
   └────┼────┘   Fcst  Fcst  Fcst
        ↓        Chart Dir   Wind
     Nearby            Chart Table
     Airports            ↑
     (+ METAR   selectedForecastIdx
      wind)   (synced across all three)
```

### Key Abstractions

1. **WindDataPoint** (`src/lib/types.ts`): Normalized observation with timestamp, wspd, wgst, wdir.

2. **ForecastDataPoint** (`src/lib/types.ts`): NBM forecast point with timestamp, wspd, wgst, wdir, temp, dewp, sky, pop, cig, vis, cloudBase, tstm, and the MVFR/IFR/LIFR and precipitation-type probabilities.

3. **AirportFullData** (`src/app/actions.ts`): Combined payload with airport info, wind timeseries, and METAR.

4. **ForecastData** (`src/lib/types.ts`): NBM forecast container with icao, name, and forecasts array.

5. **NbmProductType** (`src/lib/nbm-parser.ts`): `'nbh' | 'nbs'` — selects between hourly (24h) and 3-hourly (72h) NBM products.

6. **NbmParsedData** (`src/lib/nbm-parser.ts`): Parsed bulletin data with station, times, and aviation fields (wdr, wsp, gst, tmp, dpt, sky, cig, vis, pop).

7. **CloudLayer** (`src/lib/types.ts`): One reported cloud layer — cover code plus base in feet AGL.

8. **Weather utilities** (`src/lib/weather.ts`): Pure helpers shared by every conditions view — visibility parsing/formatting, ceiling extraction, flight category (VFR/MVFR/IFR/LIFR), METAR weather-string decoding, and derived values (relative humidity, pressure/density altitude).

9. **Prefetch Cache**: Server-side prefetch of top 3 favorites; client caches results for instant switching.

---

## Critical Constraints

### 1. Server Actions Only

All external API calls (Synoptic, METAR, airport lookup) must go through server actions in `src/app/actions.ts`. Do not call external APIs directly from client components.

### 2. Synoptic API Secrets

Synoptic configuration is environment-driven in `src/app/actions.ts`. The app requires both:
```typescript
SYNOPTIC_API_TOKEN
SYNOPTIC_ORIGIN
```

`SYNOPTIC_API_TOKEN` is the Synoptic Data API token. `SYNOPTIC_ORIGIN` is sent as the request `Origin` header (typically `https://www.weather.gov`). Set these in Vercel Project Environment Variables (Production/Preview/Development) and in local `.env.local` for local development.

Optional Datadog RUM configuration is enabled when both of these are set:
```typescript
NEXT_PUBLIC_DD_RUM_APPLICATION_ID
NEXT_PUBLIC_DD_RUM_CLIENT_TOKEN
```

Set these in Vercel Project Environment Variables (Production/Preview/Development) for browser telemetry in deployed environments.

### 3. Airport Data is Static

Airport/runway data is bundled in `src/lib/airports-data.json`. A pre-built k-d tree spatial index (`src/lib/spatial-index.bin`) enables efficient nearby airport queries using geokdbush. To update:
```bash
npm run update-nasr:download  # Downloads fresh NASR data
npm run update-nasr           # Regenerates JSON + spatial index from downloads
npm run update-nasr:index     # Rebuilds only spatial index from existing JSON
```

Do not modify `airports-data.json` manually unless adding a single airport. If you do, run `npm run update-nasr:index` to rebuild the spatial index.

### 4. Canvas Rendering (WindDirectionChart, ForecastDirectionChart)

Both polar radars use raw Canvas API, not Chart.js. Key points:
- Handle device pixel ratio (`window.devicePixelRatio`) for crisp rendering
- Redraw on resize via `ResizeObserver` or effect deps
- Points stored in ref for tooltip hit detection and click-to-select
- Bail out when the computed `maxRadius` is `<= 0`: the canvas can measure zero mid-layout, and a negative arc radius throws and aborts the whole draw pass
- ForecastDirectionChart supports synced selection via `selectedIdx`/`onSelectIdx` props

### 5. URL State Sync

WindPlot uses path routing for UI state:
- Observation: `/{ICAO}/observation/{hours}h` (example: `/KFRG/observation/6h`)
- Forecast: `/{ICAO}/forecast/{hours}h` (example: `/KFRG/forecast/24h`)

Legacy query links (`?icao=...&hours=...`) are still accepted on `/` and upgraded client-side with `router.replace(...)` (no full refresh).

---

## Common Workflows

### Adding a New Data Field

1. **Update type** in `src/lib/types.ts`:
```typescript
interface WindDataPoint {
  // existing...
  visibility?: number;
}
```

2. **Parse in server action** (`src/app/actions.ts`):
```typescript
visibility: obs.visibility_set_1?.[i] ?? null,
```

3. **Display in component** (e.g., WindSpeedChart or new component)

### Adding a New Chart

1. Create component in `src/components/NewChart.tsx`
2. Accept `observations: WindDataPoint[]` and any other needed props
3. Import and render in `WindPlot.tsx` within the data-loaded section

### Changing Favorite Airports

Edit `FAVORITE_ICAOS` array in `src/app/actions.ts`:
```typescript
const FAVORITE_ICAOS = ['KCDW', 'KFRG', 'KTEB', 'KMMU', 'KEWR'];
```

### Adding Runway Surface Filtering

The `SettingsModal` stores allowed surfaces in localStorage. `RunwayWindTable` filters based on `allowedSurfaces` prop. To add a new surface type:
1. Add to surface type list in `SettingsModal.tsx`
2. Ensure NASR data includes the surface code

---

## API Reference

### Synoptic Data API

```
GET https://api.synopticdata.com/v2/stations/timeseries
  ?STID={icao}
  &showemptystations=1
  &units=temp|F,speed|kts,english
  &recent={minutes}
  &complete=1
  &token={token}
  &obtimezone=local
```

Returns 5-minute AWOS observations. No `vars` parameter is sent, so the response carries every variable the station reports. Fields used:
- `wind_speed_set_1` (knots)
- `wind_gust_set_1` (knots)
- `wind_direction_set_1` (degrees)
- `air_temp_set_1` / `dew_point_temperature_set_1` (°F, from `units=temp|F`)
- `visibility_set_1` (statute miles regardless of unit system; a negative value means "less than", e.g. `-0.25` = under 1/4 mile)
- `altimeter_set_1` (unit varies — see `normalizeAltimeterToInHg`)
- `cloud_layer_1_code_set_1` … `cloud_layer_3_code_set_1` (packed height + coverage)
- `weather_condition_set_1`, falling back to `weather_summary_set_1`

Station metadata supplies `ELEVATION` (feet), used as the density-altitude fallback when METAR is unavailable.

**Cloud layer codes**: every digit but the last is the height in hundreds of feet; the last digit is the sky condition — 0 missing, 1 clear, 2 scattered, 3 broken, 4 overcast, 5 obscured, 6–9 the "thin" variants. `222` is 2,200 ft scattered. `decodeSynopticCloudLayer` maps thin variants to their base coverage, which can only over-state a restriction — the safe direction for flight planning. Synoptic's scale has no FEW.
See https://docs.synopticdata.com/services/cloud-height-and-sky-condition.

### Aviation Weather API (METAR)

```
GET https://aviationweather.gov/api/data/metar?ids={icao}&format=json
GET https://aviationweather.gov/api/data/metar?ids={icao1},{icao2},{icao3}&format=json
```

Returns latest METAR with current conditions. Single-station fetch (`getMetar`) is used for "live" wind display when Synoptic is stale. Batch fetch (`getMetarBatch`) supports comma-separated IDs and is used by NearbyAirports to show wind and flight category for multiple airports in one request. Both share the `toMetarData` normalizer in `actions.ts`.

Fields consumed beyond wind: `clouds` (array of `{cover, base}` in feet AGL), `cover` (summary code — the API sends `clouds: []` with `cover: "CLR"` for a clear sky), `visib` (statute miles, sometimes `"10+"` or a fraction like `"1 1/2"`), `temp` / `dewp` (°C), `altim` (hPa), `wxString` (present weather groups), `vertVis` (indefinite ceiling, feet), and `elev` (station elevation in meters, used for density altitude).

### NOAA NBM Text Bulletins

NBM (National Blend of Models) forecasts are fetched from NOMADS as text bulletins. Two products are supported:

**NBH — Hourly (24h)**
```
GET https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.{YYYYMMDD}/{HH}/text/blend_nbhtx.t{HH}z
```
- 1-hour intervals, ~24 forecast hours
- Time columns are UTC clock hours
- Uses `P01` for 1-hour precipitation probability

**NBS — Short-range (72h)**
```
GET https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.{YYYYMMDD}/{HH}/text/blend_nbstx.t{HH}z
```
- 3-hour intervals, ~72 forecast hours
- Time columns are `FHR` (forecast hour relative to base time)
- Uses `P06` for 6-hour precipitation probability (falls back if `P01` absent)

Both bulletins share the same aviation-relevant fields:
- `WDR` - Wind direction (tens of degrees, multiply by 10)
- `WSP` - Wind speed (knots)
- `GST` - Wind gust (knots)
- `TMP` - Temperature (°F)
- `DPT` - Dew point (°F)
- `SKY` - Sky cover (%)
- `CIG` - Ceiling (hundreds of feet, 888 / -88 = unlimited)
- `VIS` - Visibility (tenths of miles)
- `LCB` - Lowest cloud base (hundreds of feet, same encoding as `CIG`)
- `T01` / `T03` - Thunderstorm probability (% — `T01` on NBH, `T03` on NBS)
- `MVC` / `IFC` / `LIC` - Probability of an MVFR / IFR / LIFR ceiling (%). NBS publishes only `IFC`; absent rows parse to an empty array.
- `PRA` / `PSN` / `PPL` / `PZR` - Conditional probability of rain / snow / ice pellets / freezing rain (%)

`CIG`, `VIS` and `LCB` are written as 3-character fixed-width fields that run together when values are 3 digits (`210220210`), so they are read with `parseFixedWidthRow` rather than a whitespace split.

The parser (`src/lib/nbm-parser.ts`) extracts station-specific sections from the bulk bulletin file using delimiter patterns. The fetch logic (`fetchNbmBulletin` in `actions.ts`) includes fallback to the previous cycle hour if the current one is not yet available. Only airports that are NBM forecast stations will have forecast data.

**Timezone Conversion**: NBM bulletins provide times in UTC. The `getNbmForecast` function uses the `@photostructure/tz-lookup` library to determine the airport's IANA timezone from its coordinates, then converts UTC times to local time for display using the Intl API's `timeZone` option.

---

## Testing & Verification

### Commands

```bash
npm run dev                # Local dev server
npm run build              # Production build
npm run lint               # ESLint
npm run test               # Run tests in watch mode (vitest)
npm run test:run           # Run tests once (vitest run)
npm run update-nasr        # Full NASR update (download + parse + index)
npm run update-nasr:download  # Download fresh NASR data only
npm run update-nasr:parse  # Parse downloaded NASR data only
npm run update-nasr:index  # Rebuild spatial index only
```

### What to Verify

| Change Type | Verification Steps |
|-------------|-------------------|
| Data fetching | Check browser console + network tab |
| Chart rendering | Visual inspection on multiple airports |
| Airport search | Type partial ICAO/name, verify results |
| URL routing | Navigate between airports/modes/hours and verify path updates + state persistence |
| Mobile layout | Test on narrow viewport |
| NBM parser | `npm run test:run` |
| Weather utilities | `npm run test:run` |
| Conditions panels | Compare a VFR airport (KSFO), an MVFR/IFR airport (KMRY, KSEA), and one with many layers (KEWR); toggle 5-min/METAR on each |
| Sky history | Pick an airport whose ceiling moved over the window; check the category strip and ceiling line track the layer dots |
| Forecast view | Toggle Obs/Forecast, switch 24h/72h, verify synced selection across all four forecast components |

---

## Linting & Code Quality

**Always run `npm run lint` before committing changes.** The project uses ESLint with React Compiler rules that enforce strict patterns.

### Common Lint Errors

#### 1. Impure Functions During Render

**Error**: `Date.now()` or other impure functions called during render.

**Fix**: Move to state with useEffect for periodic updates:
```typescript
// Bad
const isStale = Date.now() - timestamp > threshold;

// Good
const [now, setNow] = useState(() => Date.now());
useEffect(() => {
  const interval = setInterval(() => setNow(Date.now()), 60000);
  return () => clearInterval(interval);
}, []);
const isStale = now - timestamp > threshold;
```

#### 2. useMemo Dependency Mismatches

**Error**: React Compiler cannot preserve memoization due to dependency inference mismatch.

**Fix**: Use the full object instead of optional chaining in dependencies:
```typescript
// Bad - compiler infers different dependency
useMemo(() => {
  return metar?.obsTime ? calculate(metar.obsTime) : null;
}, [metar?.obsTime]);

// Good - matches compiler inference
useMemo(() => {
  return metar?.obsTime ? calculate(metar.obsTime) : null;
}, [metar]);
```

#### 3. Logical Expressions in useMemo Dependencies

**Error**: Logical expression could make dependencies change on every render.

**Fix**: Move the expression inside the useMemo callback:
```typescript
// Bad
const items = someArray || [];
const filtered = useMemo(() => items.filter(...), [items]);

// Good
const filtered = useMemo(() => {
  const items = someArray || [];
  return items.filter(...);
}, [someArray]);
```

#### 4. setState in useEffect Without Transition

When calling setState synchronously in useEffect based on prop changes, wrap in startTransition:
```typescript
useEffect(() => {
  if (condition) {
    startTransition(() => {
      setResults([]);
      setShowDropdown(false);
    });
  }
}, [condition]);
```

Alternatively, derive state from existing values instead of synchronous setState. For example, instead of `setMetarsLoaded(false)` in an effect body, use a derived comparison:
```typescript
// Bad - synchronous setState in effect body
useEffect(() => {
  setMetarsLoaded(false);
  fetchData().then(() => setMetarsLoaded(true));
}, [dep]);

// Good - derive loaded state from tracking which dep was loaded
const [loadedDep, setLoadedDep] = useState(null);
const isLoaded = loadedDep === dep;
useEffect(() => {
  fetchData().then(() => setLoadedDep(dep));
}, [dep]);
```

---

## Common Pitfalls

### 1. Stale Synoptic Data

Some airports have intermittent observations. The app shows a warning when data is >70 minutes old and falls back to METAR for current conditions.

### 2. Missing Runways

Not all airports in NASR have runway data. `RunwayWindTable` handles empty `runways` array gracefully.

### 3. Canvas Scaling

Forgetting `devicePixelRatio` makes the polar chart blurry on Retina displays. Always scale canvas:
```typescript
const dpr = window.devicePixelRatio || 1;
canvas.width = rect.width * dpr;
canvas.height = rect.height * dpr;
ctx.scale(dpr, dpr);
```

### 4. Calm Wind Handling in METAR

The Aviation Weather API returns `wdir=0, wspd=0` for calm wind and `wdir=0, wspd>0` for variable (VRB) wind. The `getMetar`/`getMetarBatch` functions preserve `wdir=0` only when `wspd=0` (calm); when `wspd>0`, `wdir` is set to `null` (variable direction is not meaningful for crosswind calculations).

In the NearbyAirports table, calm wind displays as **CALM**, airports with no METAR data show **MISSING** (amber), and the `RunwayWindTable` METAR source computes calm as 0kt headwind/crosswind on all runways (matching the 5-min observation behavior).

### 5. NearbyAirports View Mode

`NearbyAirports` accepts a `showWind` prop. When `false` (forecast view), the METAR batch fetch is skipped and the Wind column is hidden. This avoids unnecessary API calls when viewing forecasts, since METAR is observation data.

### 6. Touch Scroll on Charts

`WindSpeedChart` and `ForecastChart` use the `useHorizontalSwipeLock` hook to prevent vertical page scrolling when the user swipes horizontally on the chart. The hook detects gesture direction on initial movement and locks it for the duration of the touch. Vertical swipes still scroll normally. If adding new interactive chart components, apply this hook to the chart container div to maintain the same behavior.

### 7. Flight Category Is Derived, Not Reported

The app never reads the API's `fltCat` field. `computeFlightCategory` in `src/lib/weather.ts` derives it from the ceiling (lowest BKN/OVC/OVX layer, or vertical visibility) and visibility, taking the more restrictive of the two. This keeps observations and NBM forecasts on the same rules — NBM has no `fltCat` to read. A null ceiling means "no ceiling", so visibility alone decides; a null on both sides yields `null` and the badge renders as a dash.

### 8. Conditions Come From Two Sources With Different Units

`CurrentConditions` defaults to the Synoptic 5-minute observation and offers a METAR toggle, mirroring `RunwayWindTable`. The two sources disagree on units — Synoptic returns °F (per the `temp|F` request) while METAR returns °C, and altimeter arrives as inHg, hPa or Pa depending on source — so **never read either raw shape in a component**. `src/lib/conditions.ts` normalizes both into `ObservedConditions` (Celsius, statute miles, inHg) and is the only place that knows the difference.

Because the conditions ride on every `WindDataPoint`, the whole window is a time series, not just a latest value — `ConditionsHistory` plots it as a time-height chart (one dot per reported layer, coloured by coverage) with the ceiling and visibility over the top. It shares the 12,000 ft / 10 sm caps with `ForecastConditions` so the observation and forecast panels read on the same scale, and it hides itself when no record carries a layer.

Two behaviors worth preserving:
- Not every station reports sky/visibility in the 5-minute feed. `latestConditionObservation` walks backwards for the newest record that actually has conditions, and the panel falls back to METAR (with a visible note) when there are none. `hasSkyData` is the narrower test used by the history plot — temperature alone would add an empty column.
- ASOS ceilometers report at most 3 layers and only below 12,000 ft, so the 5-minute view can miss high layers METAR includes — meaning its ceiling can read *less* restrictive than METAR's. The panel says so in a footnote; don't remove it.

### 9. NBM Ceilings: Null Means Unlimited

`parseNbmBulletin` maps the sentinel values `888` and `-88` to `null` for `CIG` and `LCB`, matching NBM's "no ceiling / no clouds" encoding. Forecast views therefore render `null` as "Unlimited" rather than "unknown", and `ForecastConditions` pins those points to the top of the ceiling axis (capped at 12,000 ft).

### 10. Timezone Handling

**Observations**: Synoptic API returns times in the airport's local timezone via the `obtimezone=local` parameter. The `time` field is display-only; use `timestamp` (Unix seconds) for calculations.

**Forecasts**: NBM bulletins use UTC times. The `getNbmForecast` function:
1. Gets the airport's timezone using the `@photostructure/tz-lookup` library based on lat/lon coordinates
2. Converts UTC forecast times to the airport's local timezone when formatting display strings
3. Uses the Intl API's `timeZone` option to ensure consistency with observations

Both observations and forecasts display times in the **airport's local timezone**, not the user's browser timezone.

---

## File Quick Reference

| Purpose | File(s) |
|---------|---------|
| Main page loader | `src/app/WindPlotPage.tsx` |
| Root + legacy query compatibility route | `src/app/page.tsx` |
| Path-routed page | `src/app/[icao]/[mode]/[duration]/page.tsx` |
| All API calls | `src/app/actions.ts` |
| URL route utilities | `src/lib/windplot-route.ts` |
| NBM bulletin parser | `src/lib/nbm-parser.ts` |
| NBM parser tests | `src/app/nbm-parser.test.ts` |
| Cache utilities | `src/lib/cache.ts` |
| Client state | `src/components/WindPlot.tsx` |
| Speed chart | `src/components/WindSpeedChart.tsx` |
| Direction radar | `src/components/WindDirectionChart.tsx` |
| Crosswind table | `src/components/RunwayWindTable.tsx` |
| Forecast chart | `src/components/ForecastChart.tsx` |
| Forecast direction | `src/components/ForecastDirectionChart.tsx` |
| Forecast table | `src/components/ForecastWindTable.tsx` |
| Airport search | `src/components/AirportSelector.tsx` |
| Nearby airports (table + METAR wind + category) | `src/components/NearbyAirports.tsx` |
| Current conditions (clouds, visibility) | `src/components/CurrentConditions.tsx` |
| Sky condition history (layers over time) | `src/components/ConditionsHistory.tsx` |
| Forecast conditions (ceiling, visibility) | `src/components/ForecastConditions.tsx` |
| Cloud layer diagram | `src/components/SkyDiagram.tsx` |
| Flight category badge | `src/components/FlightCategoryBadge.tsx` |
| Shared stat tile | `src/components/StatTile.tsx` |
| Weather utilities | `src/lib/weather.ts` |
| Observation source normalization | `src/lib/conditions.ts` |
| Weather utility tests | `src/lib/weather.test.ts` |
| Source normalization tests | `src/lib/conditions.test.ts` |
| Horizontal swipe lock hook | `src/lib/useHorizontalSwipeLock.ts` |
| Type definitions | `src/lib/types.ts` |
| Airport data | `src/lib/airports-data.json` |
| Spatial index | `src/lib/spatial-index.bin` |
| NASR updater | `scripts/update-nasr.mjs` |

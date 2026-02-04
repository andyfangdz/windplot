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

---

## Project Overview

**WindPlot** is a Next.js 16 aviation weather visualization app. It fetches real-time wind observations from the Synoptic Data API and displays wind speed, gusts, and direction with runway overlays for crosswind assessment.

### Tech Stack
- **Framework**: Next.js 16 (App Router, React 19)
- **Charts**: Chart.js + react-chartjs-2 (speed chart), Canvas API (direction radar)
- **Weather API**: Synoptic Data API (5-minute AWOS observations)
- **METAR**: Aviation Weather Center API
- **Styling**: Tailwind CSS 4
- **Airport Data**: FAA NASR subscription (bundled JSON)

---

## Architecture

### Directory Structure

```
src/
├── app/
│   ├── page.tsx              # Main page (server component, data fetching)
│   ├── actions.ts            # Server actions: wind data, airport search, METAR
│   └── layout.tsx            # Root layout
├── components/
│   ├── WindPlot.tsx          # Main client component, state management
│   ├── WindSpeedChart.tsx    # Time series (Chart.js Line)
│   ├── WindDirectionChart.tsx # Polar radar (Canvas API)
│   ├── RunwayWindTable.tsx   # Crosswind/headwind breakdown
│   ├── AirportSelector.tsx   # Search + quick-select
│   ├── NearbyAirports.tsx    # Nearby airports directory
│   └── SettingsModal.tsx     # Runway surface filter settings
├── lib/
│   ├── types.ts              # TypeScript interfaces
│   ├── airports.ts           # Airport utilities (unused, data in JSON)
│   ├── airports-data.json    # 4,450 US airports from NASR
│   └── spatial-index.bin     # Pre-built k-d tree for nearby queries
scripts/
└── update-nasr.mjs           # Fetch/regenerate airport data
data/
└── (NASR downloads cached here)
```

### Data Flow

```
[Synoptic API]              [Aviation Weather API]
      ↓                              ↓
getWindData()                  getMetar()
      ↓                              ↓
      └──────────┬───────────────────┘
                 ↓
      getAirportFullData() (parallel fetch)
                 ↓
      page.tsx (server component)
                 ↓
      WindPlot (client state holder, 5-min auto-refresh)
                 ↓
   ┌─────────────┼─────────────┐
   ↓             ↓             ↓
WindSpeedChart  WindDirectionChart  RunwayWindTable
```

### Key Abstractions

1. **WindDataPoint** (`src/lib/types.ts`): Normalized observation with timestamp, wspd, wgst, wdir.

2. **AirportFullData** (`src/app/actions.ts`): Combined payload with airport info, wind timeseries, and METAR.

3. **Prefetch Cache**: Server-side prefetch of top 3 favorites; client caches results for instant switching.

---

## Critical Constraints

### 1. Server Actions Only

All external API calls (Synoptic, METAR, airport lookup) must go through server actions in `src/app/actions.ts`. Do not call external APIs directly from client components.

### 2. Synoptic API Token

The Synoptic API token is hardcoded in `actions.ts`. For production, move to environment variable:
```typescript
const SYNOPTIC_TOKEN = process.env.SYNOPTIC_API_TOKEN || '...';
```

### 3. Airport Data is Static

Airport/runway data is bundled in `src/lib/airports-data.json`. A pre-built k-d tree spatial index (`src/lib/spatial-index.bin`) enables efficient nearby airport queries using geokdbush. To update:
```bash
npm run update-nasr:download  # Downloads fresh NASR data
npm run update-nasr           # Regenerates JSON + spatial index from downloads
npm run update-nasr:index     # Rebuilds only spatial index from existing JSON
```

Do not modify `airports-data.json` manually unless adding a single airport. If you do, run `npm run update-nasr:index` to rebuild the spatial index.

### 4. Canvas Rendering (WindDirectionChart)

The polar radar uses raw Canvas API, not Chart.js. Key points:
- Handle device pixel ratio (`window.devicePixelRatio`) for crisp rendering
- Redraw on resize via `ResizeObserver` or effect deps
- Points stored in ref for tooltip hit detection

### 5. URL State Sync

Airport and hours sync to URL query params (`?icao=KFRG&hours=6`). When changing state:
```typescript
router.push(`?icao=${icao}&hours=${hours}`, { scroll: false });
```

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

Returns 5-minute AWOS observations. Fields used:
- `wind_speed_set_1` (knots)
- `wind_gust_set_1` (knots)
- `wind_direction_set_1` (degrees)

### Aviation Weather API (METAR)

```
GET https://aviationweather.gov/api/data/metar?ids={icao}&format=json
```

Returns latest METAR with current conditions. Used for "live" wind display when Synoptic is stale.

---

## Testing & Verification

### Commands

```bash
npm run dev             # Local dev server
npm run build           # Production build
npm run lint            # ESLint
npm run update-nasr     # Full NASR update (download + parse + index)
npm run update-nasr:index  # Rebuild spatial index only
```

### What to Verify

| Change Type | Verification Steps |
|-------------|-------------------|
| Data fetching | Check browser console + network tab |
| Chart rendering | Visual inspection on multiple airports |
| Airport search | Type partial ICAO/name, verify results |
| URL params | Refresh page, verify state persists |
| Mobile layout | Test on narrow viewport |

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

### 4. Timezone Handling

Synoptic returns local time strings. The `time` field is display-only; use `timestamp` (Unix seconds) for calculations.

---

## File Quick Reference

| Purpose | File(s) |
|---------|---------|
| Main page | `src/app/page.tsx` |
| All API calls | `src/app/actions.ts` |
| Client state | `src/components/WindPlot.tsx` |
| Speed chart | `src/components/WindSpeedChart.tsx` |
| Direction radar | `src/components/WindDirectionChart.tsx` |
| Crosswind table | `src/components/RunwayWindTable.tsx` |
| Airport search | `src/components/AirportSelector.tsx` |
| Nearby airports | `src/components/NearbyAirports.tsx` |
| Type definitions | `src/lib/types.ts` |
| Airport data | `src/lib/airports-data.json` |
| Spatial index | `src/lib/spatial-index.bin` |
| NASR updater | `scripts/update-nasr.mjs` |

# CLAUDE

Please follow instructions from @./AGENTS.md and keep @./AGENTS.md up-to-date. Do not make updates to @./CLAUDE.md and make updates to @./AGENTS.md instead.

## Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

## Key Commands

```bash
npm run dev              # Development server
npm run build            # Production build
npm run lint             # ESLint
npm run update-nasr      # Regenerate airport data from existing NASR files
npm run update-nasr:download  # Download fresh NASR + regenerate
```

## Architecture Summary

- **Server actions** (`src/app/actions.ts`): All external API calls (Synoptic, METAR, airport search)
- **Client state** (`src/components/WindPlot.tsx`): Main component with 5-min auto-refresh
- **Charts**: Chart.js for speed timeseries, Canvas API for polar radar
- **Airport data**: Static JSON from FAA NASR (`src/lib/airports-data.json`)

See @./AGENTS.md for full architecture details, constraints, and workflows.

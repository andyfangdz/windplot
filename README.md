# WindPlot ✈️

Real-time aviation wind data visualization for pilots. Shows wind speed, gusts, and direction with runway overlays for crosswind assessment.

## Features

- **Wind Speed/Gust Chart**: Time series showing sustained winds and gusts
- **Wind Direction Radar**: Polar plot showing wind direction and speed with runway overlays
- **Searchable Airport Database**: 2,200+ US airports from FAA NASR data
- **Quick-select Favorites**: KCDW, KFRG, KTEB, KMMU, KEWR
- **Time Range**: 1h to 24h of historical data
- **Auto-refresh**: Updates every 5 minutes
- **Mobile-friendly**: Dark theme optimized for mobile devices
- **PWA Ready**: Add to home screen for app-like experience

## Airport Data

Airport and runway data is sourced from the FAA's NASR (National Airspace System Resources) 28-day subscription. This includes:

- ICAO codes and names
- Lat/lon coordinates
- Runway identifiers and true headings
- Runway dimensions and surface types

### Updating Airport Data

Airport data is bundled as a static JSON file. To update:

```bash
# Download fresh NASR data and regenerate airports-data.json
npm run update-nasr:download

# Or if data files already exist
npm run update-nasr
```

The script fetches the current NASR subscription from the FAA and generates `src/lib/airports-data.json`.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Import in Vercel Dashboard
3. Add required environment variables in Project Settings:
   - `SYNOPTIC_API_TOKEN` (Synoptic Data API token)
   - `SYNOPTIC_ORIGIN` (allowed request origin, e.g. `https://www.weather.gov`)
4. Deploy

### Manual

```bash
npm run build
npm start
```

## Data Sources

- **Weather**: [Synoptic Data API](https://synopticdata.com/) (5-minute AWOS observations)
- **Airports**: [FAA NASR Subscription](https://www.faa.gov/air_traffic/flight_info/aeronav/aero_data/NASR_Subscription/)

## URL Parameters

- `?icao=KFRG` - Select airport (any valid ICAO)
- `?hours=6` - Time range (1, 2, 4, 6, 12, 24)
- `?icao=KTEB&hours=12` - Combined

## Tech Stack

- Next.js 16+ (App Router)
- React 19+
- Chart.js + react-chartjs-2
- Tailwind CSS
- TypeScript

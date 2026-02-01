# WindPlot ✈️

Real-time aviation wind data visualization for pilots. Shows wind speed, gusts, and direction with runway overlays for crosswind assessment.

## Features

- **Wind Speed/Gust Chart**: Time series showing sustained winds and gusts
- **Wind Direction Radar**: Polar plot showing wind direction and speed with runway overlays
- **Airport Selector**: Quick switching between KCDW, KFRG, KTEB, KMMU, KEWR
- **Time Range**: 1h to 24h of historical data
- **Auto-refresh**: Updates every 5 minutes
- **Mobile-friendly**: Dark theme optimized for mobile devices
- **PWA Ready**: Add to home screen for app-like experience

## Supported Airports

| ICAO | Name | Runways |
|------|------|---------|
| KCDW | Essex County | 04/22 (030°), 10/28 (083°) |
| KFRG | Republic | 01/19 (359°), 14/32 (132°) |
| KTEB | Teterboro | 01/19 (010°), 06/24 (058°) |
| KMMU | Morristown | 05/23 (049°), 13/31 (131°) |
| KEWR | Newark Liberty | 04L/22R (040°), 04R/22L (043°), 11/29 (114°) |

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
3. Deploy (zero configuration needed)

### Manual

```bash
npm run build
npm start
```

## Data Source

Weather data from [Aviation Weather Center](https://aviationweather.gov) METAR API.

## URL Parameters

- `?icao=KFRG` - Select airport
- `?hours=6` - Time range (1, 2, 4, 6, 12, 24)
- `?icao=KTEB&hours=12` - Combined

## Tech Stack

- Next.js 14+ (App Router)
- React 18+
- Chart.js + react-chartjs-2
- Tailwind CSS
- TypeScript

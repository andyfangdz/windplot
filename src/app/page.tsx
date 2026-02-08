import WindPlotPage from './WindPlotPage';
import {
  buildWindPlotPath,
  DEFAULT_FORECAST_HOURS,
  normalizeLegacyQueryRoute,
} from '@/lib/windplot-route';

export const metadata = {
  title: 'WindPlot - Aviation Wind Data',
  description: 'Real-time wind speed, gusts, and direction for local airports',
};

interface PageProps {
  searchParams: Promise<{ icao?: string; hours?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const route = normalizeLegacyQueryRoute(params);
  const hasLegacyParams = Boolean(params.icao || params.hours);

  return (
    <WindPlotPage
      initialIcao={route.icao}
      observationHours={route.durationHours}
      initialViewMode="observations"
      initialForecastHoursLimit={DEFAULT_FORECAST_HOURS}
      legacyRedirectPath={hasLegacyParams ? buildWindPlotPath(route) : null}
    />
  );
}

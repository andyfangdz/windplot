import WindPlotPage from '@/app/WindPlotPage';
import {
  DEFAULT_FORECAST_HOURS,
  DEFAULT_OBSERVATION_HOURS,
  normalizePathRoute,
  routeModeToViewMode,
} from '@/lib/windplot-route';

export const metadata = {
  title: 'WindPlot - Aviation Wind Data',
  description: 'Real-time wind speed, gusts, and direction for local airports',
};

interface PageProps {
  params: Promise<{
    icao?: string;
    mode?: string;
    duration?: string;
  }>;
}

export default async function WindPlotPathPage({ params }: PageProps) {
  const rawParams = await params;
  const route = normalizePathRoute(rawParams);

  return (
    <WindPlotPage
      initialIcao={route.icao}
      observationHours={route.mode === 'observation' ? route.durationHours : DEFAULT_OBSERVATION_HOURS}
      initialViewMode={routeModeToViewMode(route.mode)}
      initialForecastHoursLimit={route.mode === 'forecast' ? route.durationHours : DEFAULT_FORECAST_HOURS}
    />
  );
}

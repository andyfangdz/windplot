import { Suspense } from 'react';
import WindPlot from '@/components/WindPlot';
import {
  getFavoriteAirports,
  getAirportFullData,
  prefetchFavorites,
} from './actions';
import { WindPlotViewMode } from '@/lib/windplot-route';

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#1d9bf0] border-t-transparent"></div>
        <p className="text-[var(--text-secondary)] mt-4 text-sm">Loading...</p>
      </div>
    </div>
  );
}

interface WindPlotPageProps {
  initialIcao: string;
  observationHours: number;
  initialViewMode: WindPlotViewMode;
  initialForecastHoursLimit: number;
  legacyRedirectPath?: string | null;
}

export default async function WindPlotPage({
  initialIcao,
  observationHours,
  initialViewMode,
  initialForecastHoursLimit,
  legacyRedirectPath = null,
}: WindPlotPageProps) {
  const [favorites, initialFullData, prefetchedData] = await Promise.all([
    getFavoriteAirports(),
    getAirportFullData(initialIcao, observationHours),
    prefetchFavorites(observationHours, 3),
  ]);

  const allPrefetched = {
    ...prefetchedData,
    [initialIcao]: initialFullData,
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      <WindPlot
        initialIcao={initialIcao}
        initialHours={observationHours}
        initialViewMode={initialViewMode}
        initialForecastHoursLimit={initialForecastHoursLimit}
        legacyRedirectPath={legacyRedirectPath}
        initialAirport={initialFullData.airport}
        initialData={initialFullData.windData}
        initialMetar={initialFullData.metar}
        favorites={favorites}
        prefetchedData={allPrefetched}
      />
    </Suspense>
  );
}

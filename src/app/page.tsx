import { Suspense } from 'react';
import WindPlot from '@/components/WindPlot';
import {
  getFavoriteAirports,
  getAirportFullData,
  prefetchFavorites,
} from './actions';

export const metadata = {
  title: 'WindPlot - Aviation Wind Data',
  description: 'Real-time wind speed, gusts, and direction for local airports',
};

function LoadingFallback() {
  return (
    <div className="min-h-screen bg-[#0f1419] text-white p-4 flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#1d9bf0] border-t-transparent"></div>
        <p className="text-[#8899a6] mt-4">Loading...</p>
      </div>
    </div>
  );
}

interface PageProps {
  searchParams: Promise<{ icao?: string; hours?: string }>;
}

export default async function Home({ searchParams }: PageProps) {
  const params = await searchParams;
  const icao = params.icao?.toUpperCase() || 'KCDW';
  const hours = parseInt(params.hours || '4', 10);

  // Fetch data server-side: current airport + prefetch top 3 favorites
  const [favorites, initialFullData, prefetchedData] = await Promise.all([
    getFavoriteAirports(),
    getAirportFullData(icao, hours),
    prefetchFavorites(hours, 3),
  ]);

  // Merge initial data into prefetched (in case it's a favorite)
  const allPrefetched = {
    ...prefetchedData,
    [icao]: initialFullData,
  };

  return (
    <Suspense fallback={<LoadingFallback />}>
      <WindPlot
        initialIcao={icao}
        initialHours={hours}
        initialAirport={initialFullData.airport}
        initialData={initialFullData.windData}
        initialMetar={initialFullData.metar}
        favorites={favorites}
        prefetchedData={allPrefetched}
      />
    </Suspense>
  );
}

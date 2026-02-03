'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AirportSelector from './AirportSelector';
import WindSpeedChart from './WindSpeedChart';
import WindDirectionChart from './WindDirectionChart';
import RunwayWindTable from './RunwayWindTable';
import { WindData } from '@/lib/types';
import { getAirport, Airport, AirportSearchResult } from '@/app/actions';

interface WindPlotProps {
  initialIcao: string;
  initialHours: number;
  initialAirport: Airport | null;
  favorites: AirportSearchResult[];
}

export default function WindPlot({
  initialIcao,
  initialHours,
  initialAirport,
  favorites,
}: WindPlotProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  const [icao, setIcao] = useState(initialIcao);
  const [hours, setHours] = useState(initialHours);
  const [airport, setAirport] = useState<Airport | null>(initialAirport);
  const [data, setData] = useState<WindData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    const abortController = new AbortController();
    
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/synoptic?icao=${icao}&hours=${hours}`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Failed to fetch data');
        }
        const windData: WindData = await response.json();
        // Only update if this request wasn't aborted
        if (!abortController.signal.aborted) {
          setData(windData);
          setLastUpdate(new Date());
        }
      } catch (err) {
        // Don't set error if request was aborted (user switched airports)
        if (err instanceof Error && err.name === 'AbortError') {
          return;
        }
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        if (!abortController.signal.aborted) {
          setLoading(false);
        }
      }
    };

    fetchData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    
    return () => {
      abortController.abort();
      clearInterval(interval);
    };
  }, [icao, hours]);

  const handleAirportChange = (newIcao: string) => {
    // Clear old data immediately to prevent showing stale data
    setData(null);
    setIcao(newIcao);
    // Fetch new airport data via server action
    startTransition(async () => {
      const newAirport = await getAirport(newIcao);
      setAirport(newAirport);
    });
    router.push(`?icao=${newIcao}&hours=${hours}`, { scroll: false });
  };

  const handleHoursChange = (newHours: number) => {
    setHours(newHours);
    router.push(`?icao=${icao}&hours=${newHours}`, { scroll: false });
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/synoptic?icao=${icao}&hours=${hours}`);
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to fetch data');
      }
      const windData: WindData = await response.json();
      setData(windData);
      setLastUpdate(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const runways = airport?.runways || [];

  // Check if synoptic data is stale (>70 minutes old)
  const staleThresholdMs = 70 * 60 * 1000; // 70 minutes
  const latestObsTimestamp = data?.observations?.length
    ? Math.max(...data.observations.map((o) => o.timestamp))
    : null;
  const isSynopticStale = latestObsTimestamp
    ? Date.now() - latestObsTimestamp * 1000 > staleThresholdMs
    : false;
  const staleMinutes = latestObsTimestamp
    ? Math.round((Date.now() - latestObsTimestamp * 1000) / 60000)
    : 0;

  return (
    <div className="min-h-screen bg-[#0f1419] text-white p-4">
      <div className="max-w-md lg:max-w-4xl mx-auto">
        <header className="text-center mb-4">
          <h1 className="text-2xl font-bold mb-1">✈️ {icao} Wind</h1>
          <p className="text-[#8899a6] text-sm">
            {data?.name || airport?.name || icao} • Last {hours}h (5-min obs)
          </p>
          {lastUpdate && (
            <p className="text-[#8899a6] text-xs mt-1">
              Updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </header>

        <div className="max-w-md mx-auto lg:max-w-none">
          <AirportSelector
            selectedIcao={icao}
            selectedAirport={airport}
            favorites={favorites}
            onSelect={handleAirportChange}
            hours={hours}
            onHoursChange={handleHoursChange}
          />
        </div>

        {loading && !data && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#1d9bf0] border-t-transparent"></div>
            <p className="text-[#8899a6] mt-4">Loading weather data...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={handleRefresh}
              className="mt-2 px-4 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {data && data.observations.length > 0 && (
          <>
            {/* Stale data warning */}
            {isSynopticStale && (
              <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3 mb-4 text-center">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Weather data is {staleMinutes} minutes old — observations may be unavailable
                </p>
              </div>
            )}

            {/* Charts: stacked on mobile, side-by-side on desktop */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-6">
              <div className="lg:min-w-0">
                <WindSpeedChart observations={data.observations} />
              </div>
              <div className="lg:min-w-0">
                <WindDirectionChart observations={data.observations} runways={runways} />
              </div>
            </div>
            {runways.length > 0 && (
              <RunwayWindTable observations={data.observations} runways={runways} icao={icao} />
            )}
          </>
        )}

        {data && data.observations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#8899a6]">No observations available for this period.</p>
          </div>
        )}

        <footer className="text-center mt-6 text-xs text-[#8899a6]">
          <p>Data from Synoptic Data API (5-min resolution)</p>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="mt-2 px-3 py-1 bg-[#192734] hover:bg-[#22303c] rounded text-sm disabled:opacity-50"
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </footer>
      </div>
    </div>
  );
}

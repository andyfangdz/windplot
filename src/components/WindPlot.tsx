'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AirportSelector from './AirportSelector';
import WindSpeedChart from './WindSpeedChart';
import WindDirectionChart from './WindDirectionChart';
import { WindData } from '@/lib/types';
import { AIRPORTS } from '@/lib/airports';

export default function WindPlot() {
  const searchParams = useSearchParams();
  const router = useRouter();
  
  const [icao, setIcao] = useState(searchParams.get('icao')?.toUpperCase() || 'KCDW');
  const [hours, setHours] = useState(parseInt(searchParams.get('hours') || '4', 10));
  const [data, setData] = useState<WindData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/metar?icao=${icao}&hours=${hours}`);
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
  }, [icao, hours]);

  useEffect(() => {
    fetchData();
    // Auto-refresh every 5 minutes
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleAirportChange = (newIcao: string) => {
    setIcao(newIcao);
    router.push(`?icao=${newIcao}&hours=${hours}`, { scroll: false });
  };

  const handleHoursChange = (newHours: number) => {
    setHours(newHours);
    router.push(`?icao=${icao}&hours=${newHours}`, { scroll: false });
  };

  const airport = AIRPORTS[icao];
  const runways = airport?.runways || [];

  return (
    <div className="min-h-screen bg-[#0f1419] text-white p-4">
      <div className="max-w-md mx-auto">
        <header className="text-center mb-4">
          <h1 className="text-2xl font-bold mb-1">✈️ {icao} Wind</h1>
          <p className="text-[#8899a6] text-sm">
            {data?.name || airport?.name || icao} • Last {hours}h
          </p>
          {lastUpdate && (
            <p className="text-[#8899a6] text-xs mt-1">
              Updated: {lastUpdate.toLocaleTimeString()}
            </p>
          )}
        </header>

        <AirportSelector
          selectedIcao={icao}
          onSelect={handleAirportChange}
          hours={hours}
          onHoursChange={handleHoursChange}
        />

        {loading && !data && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#1d9bf0] border-t-transparent"></div>
            <p className="text-[#8899a6] mt-4">Loading METAR data...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-500/50 rounded-lg p-4 text-center">
            <p className="text-red-400">{error}</p>
            <button
              onClick={fetchData}
              className="mt-2 px-4 py-1 bg-red-600 hover:bg-red-700 rounded text-sm"
            >
              Retry
            </button>
          </div>
        )}

        {data && data.observations.length > 0 && (
          <>
            <WindSpeedChart observations={data.observations} />
            <WindDirectionChart observations={data.observations} runways={runways} />
          </>
        )}

        {data && data.observations.length === 0 && (
          <div className="text-center py-12">
            <p className="text-[#8899a6]">No observations available for this period.</p>
          </div>
        )}

        <footer className="text-center mt-6 text-xs text-[#8899a6]">
          <p>Data from Aviation Weather Center</p>
          <button
            onClick={fetchData}
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

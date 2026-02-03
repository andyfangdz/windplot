'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import AirportSelector from './AirportSelector';
import WindSpeedChart from './WindSpeedChart';
import WindDirectionChart from './WindDirectionChart';
import RunwayWindTable from './RunwayWindTable';
import SettingsModal, { Settings, loadSettings, saveSettings } from './SettingsModal';
import { WindData } from '@/lib/types';
import { isWindDataStale } from '@/lib/cache';
import {
  getAirportFullData,
  Airport,
  AirportSearchResult,
  AirportFullData,
  MetarData,
} from '@/app/actions';

interface WindPlotProps {
  initialIcao: string;
  initialHours: number;
  initialAirport: Airport | null;
  initialData: WindData | null;
  initialMetar: MetarData | null;
  favorites: AirportSearchResult[];
  prefetchedData: Record<string, AirportFullData>;
}

export default function WindPlot({
  initialIcao,
  initialHours,
  initialAirport,
  initialData,
  initialMetar,
  favorites,
  prefetchedData,
}: WindPlotProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  
  const [icao, setIcao] = useState(initialIcao);
  const [hours, setHours] = useState(initialHours);
  const [airport, setAirport] = useState<Airport | null>(initialAirport);
  const [data, setData] = useState<WindData | null>(initialData);
  const [metar, setMetar] = useState<MetarData | null>(initialMetar);
  const [metarIcao, setMetarIcao] = useState<string>(initialIcao);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<Settings>({ allowedSurfaces: [] });
  
  // Cache of prefetched data (mutable ref to avoid re-renders)
  const [cache, setCache] = useState<Record<string, AirportFullData>>(prefetchedData);

  // Load settings from localStorage on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const refresh = async () => {
      const fullData = await getAirportFullData(icao, hours);
      if (fullData.windData) {
        setData(fullData.windData);
        setAirport(fullData.airport);
        setMetar(fullData.metar);
        setMetarIcao(icao);
        // Update cache
        setCache((prev) => ({ ...prev, [icao]: fullData }));
      }
    };

    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [icao, hours]);

  const handleAirportChange = (newIcao: string) => {
    const upperIcao = newIcao.toUpperCase();

    // Check if we have prefetched data for this airport that isn't stale
    const prefetched = cache[upperIcao];
    if (prefetched && prefetched.windData && !isWindDataStale(prefetched.windData)) {
      // Use cached data immediately - no loading state needed
      setIcao(upperIcao);
      setAirport(prefetched.airport);
      setData(prefetched.windData);
      setMetar(prefetched.metar);
      setMetarIcao(upperIcao);
      setError(null);
      router.push(`?icao=${upperIcao}&hours=${hours}`, { scroll: false });
      return;
    }

    // No prefetched data - fetch it
    setData(null);
    setMetar(null);
    setIcao(upperIcao);
    setLoading(true);
    setError(null);
    
    startTransition(async () => {
      const fullData = await getAirportFullData(upperIcao, hours);
      setAirport(fullData.airport);
      setMetar(fullData.metar);
      setMetarIcao(upperIcao);
      if (fullData.windData) {
        setData(fullData.windData);
        // Cache the result
        setCache((prev) => ({ ...prev, [upperIcao]: fullData }));
      } else {
        setError('Failed to fetch data for this airport');
      }
      setLoading(false);
    });
    
    router.push(`?icao=${upperIcao}&hours=${hours}`, { scroll: false });
  };

  const handleHoursChange = (newHours: number) => {
    // Hours change invalidates cache for current airport
    setData(null);
    setMetar(null);
    setHours(newHours);
    setLoading(true);
    setError(null);
    
    startTransition(async () => {
      const fullData = await getAirportFullData(icao, newHours);
      setAirport(fullData.airport);
      setMetar(fullData.metar);
      setMetarIcao(icao);
      if (fullData.windData) {
        setData(fullData.windData);
      } else {
        setError('Failed to fetch data');
      }
      setLoading(false);
    });
    
    router.push(`?icao=${icao}&hours=${newHours}`, { scroll: false });
  };

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    
    startTransition(async () => {
      const fullData = await getAirportFullData(icao, hours);
      setAirport(fullData.airport);
      setMetar(fullData.metar);
      setMetarIcao(icao);
      if (fullData.windData) {
        setData(fullData.windData);
        // Update cache
        setCache((prev) => ({ ...prev, [icao]: fullData }));
      } else {
        setError('Failed to refresh data');
      }
      setLoading(false);
    });
  };

  const runways = airport?.runways || [];

  // Check if synoptic data is stale (>70 minutes old)
  const staleThresholdMs = 70 * 60 * 1000;
  const latestObsTimestamp = data?.observations?.length
    ? Math.max(...data.observations.map((o) => o.timestamp))
    : null;
  const isSynopticStale = latestObsTimestamp
    ? Date.now() - latestObsTimestamp * 1000 > staleThresholdMs
    : false;
  const staleMinutes = latestObsTimestamp
    ? Math.round((Date.now() - latestObsTimestamp * 1000) / 60000)
    : 0;

  const validObsTimestamps = data?.observations
    ? data.observations
        .filter((o) => o.wdir !== null && o.wspd !== null)
        .map((o) => o.timestamp)
    : [];
  const latestValidObsTimestamp = validObsTimestamps.length
    ? Math.max(...validObsTimestamps)
    : null;
  const lastDataTimestamp = (() => {
    const candidates = [
      latestValidObsTimestamp ?? null,
      metar?.obsTime ?? null,
    ].filter((v): v is number => typeof v === 'number');
    return candidates.length ? Math.max(...candidates) : null;
  })();
  const lastDataTime = lastDataTimestamp ? new Date(lastDataTimestamp * 1000) : null;

  return (
    <div className="min-h-screen bg-[#0f1419] text-white p-4 lg:flex lg:justify-center">
      <div
        className="w-full"
        style={{ maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}
      >
        <header className="text-center mb-4 relative">
          <button
            onClick={() => setShowSettings(true)}
            className="absolute right-0 top-0 p-2 text-[#8899a6] hover:text-white transition-colors"
            title="Settings"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold mb-1">✈️ {icao} Wind</h1>
          <p className="text-[#8899a6] text-sm">
            {data?.name || airport?.name || icao} • Last {hours}h (5-min obs)
          </p>
          {lastDataTime && (
            <p className="text-[#8899a6] text-xs mt-1">
              Latest observation: {lastDataTime.toLocaleTimeString()}
            </p>
          )}
        </header>

        <div className="max-w-md mx-auto lg:max-w-none lg:mx-0">
          <AirportSelector
            selectedIcao={icao}
            selectedAirport={airport}
            favorites={favorites}
            onSelect={handleAirportChange}
            hours={hours}
            onHoursChange={handleHoursChange}
          />
        </div>

        {(loading || isPending) && !data && (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#1d9bf0] border-t-transparent"></div>
            <p className="text-[#8899a6] mt-4">Loading weather data...</p>
          </div>
        )}

        {error && !data && (
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
            {/* Stale data warning - only show when not loading fresh data */}
            {isSynopticStale && !loading && !isPending && (
              <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-3 mb-4 text-center">
                <p className="text-yellow-400 text-sm">
                  ⚠️ Weather data is {staleMinutes} minutes old — observations may be unavailable
                </p>
              </div>
            )}

            {/* Charts: stacked on mobile, side-by-side on desktop */}
            <div className="lg:grid lg:grid-cols-2 lg:gap-6 lg:items-stretch">
              <div className="lg:min-w-0 lg:flex lg:flex-col">
                <WindSpeedChart observations={data.observations} />
              </div>
              <div className="lg:min-w-0 lg:flex lg:flex-col">
                <WindDirectionChart observations={data.observations} runways={runways} />
              </div>
            </div>
            {runways.length > 0 && (
              <RunwayWindTable
                observations={data.observations}
                runways={runways}
                icao={icao}
                metar={metarIcao === icao ? metar : null}
                allowedSurfaces={settings.allowedSurfaces}
              />
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
            disabled={loading || isPending}
            className="mt-2 px-3 py-1 bg-[#192734] hover:bg-[#22303c] rounded text-sm disabled:opacity-50"
          >
            {loading || isPending ? 'Refreshing...' : 'Refresh'}
          </button>
        </footer>
      </div>

      <SettingsModal
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        settings={settings}
        onSave={setSettings}
      />
    </div>
  );
}

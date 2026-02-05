'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import AirportSelector from './AirportSelector';
import WindSpeedChart from './WindSpeedChart';
import WindDirectionChart from './WindDirectionChart';
import RunwayWindTable from './RunwayWindTable';
import ForecastChart from './ForecastChart';
import ForecastDirectionChart from './ForecastDirectionChart';
import ForecastWindTable from './ForecastWindTable';
import NearbyAirports from './NearbyAirports';
import SettingsModal, { Settings, loadSettings } from './SettingsModal';
import { WindData, ForecastData } from '@/lib/types';
import { isWindDataStale } from '@/lib/cache';
import {
  getAirportFullData,
  getNbmForecast,
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

  // Request ID to handle race conditions when switching airports rapidly
  const requestIdRef = useRef(0);

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

  // Forecast view state
  const [viewMode, setViewMode] = useState<'observations' | 'forecast'>('observations');
  const [forecastRange, setForecastRange] = useState<24 | 72>(24);
  const [forecastHoursLimit, setForecastHoursLimit] = useState<number>(24);
  const [forecast, setForecast] = useState<ForecastData | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastError, setForecastError] = useState<string | null>(null);
  const [selectedForecastIdx, setSelectedForecastIdx] = useState(0);
  // Track what icao+range the current forecast was loaded for
  const loadedForecastRef = useRef<{ icao: string; range: 24 | 72 } | null>(null);
  
  // Cache of prefetched data - transform from icao keys to icao-hours keys
  const [cache, setCache] = useState<Record<string, AirportFullData>>(() => {
    // Convert prefetchedData from {ICAO: data} to {ICAO-hours: data}
    const transformed: Record<string, AirportFullData> = {};
    for (const [icaoKey, data] of Object.entries(prefetchedData)) {
      transformed[`${icaoKey}-${initialHours}`] = data;
    }
    return transformed;
  });

  // Load settings from localStorage on mount
  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // Fetch forecast data when switching to forecast view, changing airport, or changing range
  useEffect(() => {
    if (viewMode !== 'forecast') return;

    // Check if we already have the right data loaded
    const loaded = loadedForecastRef.current;
    if (loaded && loaded.icao === icao && loaded.range === forecastRange && forecast) {
      return;
    }

    setForecastLoading(true);
    setForecastError(null);
    setSelectedForecastIdx(0);
    getNbmForecast(icao, forecastRange).then((data) => {
      if (data) {
        setForecast(data);
        loadedForecastRef.current = { icao, range: forecastRange };
      } else {
        setForecastError('Failed to fetch forecast data');
        loadedForecastRef.current = null;
      }
      setForecastLoading(false);
    });
  }, [viewMode, icao, forecastRange, forecast]);

  // If initial data from server is stale, immediately refresh
  useEffect(() => {
    if (initialData && isWindDataStale(initialData)) {
      // Server returned stale cached data, fetch fresh
      getAirportFullData(initialIcao, initialHours, true).then((fullData) => {
        if (fullData.windData && !isWindDataStale(fullData.windData)) {
          setData(fullData.windData);
          setAirport(fullData.airport);
          setMetar(fullData.metar);
          // Update cache with airport+hours key
          const cacheKey = `${initialIcao}-${initialHours}`;
          setCache((prev) => ({ ...prev, [cacheKey]: fullData }));
        }
      });
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const refresh = async () => {
      // Force refresh to bypass server cache and get fresh data
      const fullData = await getAirportFullData(icao, hours, true);
      if (fullData.windData) {
        setData(fullData.windData);
        setAirport(fullData.airport);
        setMetar(fullData.metar);
        setMetarIcao(icao);
        // Update cache with airport+hours key
        const cacheKey = `${icao}-${hours}`;
        setCache((prev) => ({ ...prev, [cacheKey]: fullData }));
      }
    };

    const interval = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [icao, hours]);

  const handleAirportChange = async (newIcao: string) => {
    const upperIcao = newIcao.toUpperCase();

    // Increment request ID to track this request for race condition handling
    const requestId = ++requestIdRef.current;

    // Check if we have prefetched data for this airport+hours combo that isn't stale
    const cacheKey = `${upperIcao}-${hours}`;
    const prefetched = cache[cacheKey];
    const hasFreshCache = prefetched && prefetched.windData && !isWindDataStale(prefetched.windData);

    if (hasFreshCache) {
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

    // No fresh cache - need to fetch from server
    // If we have stale cached data for this airport+hours, force server refresh to avoid stale-while-revalidate
    const hasStaleCache = Boolean(prefetched?.windData && isWindDataStale(prefetched.windData));

    setData(null);
    setMetar(null);
    setIcao(upperIcao);
    setLoading(true);
    setError(null);

    router.push(`?icao=${upperIcao}&hours=${hours}`, { scroll: false });

    let fullData = await getAirportFullData(upperIcao, hours, hasStaleCache);

    // If server returned stale data (due to stale-while-revalidate), re-fetch with force
    if (fullData.windData && isWindDataStale(fullData.windData) && !hasStaleCache) {
      fullData = await getAirportFullData(upperIcao, hours, true);
    }

    // Check if this request is still current (handle race condition)
    if (requestIdRef.current !== requestId) {
      // A newer request was made, discard this result
      return;
    }

    setAirport(fullData.airport);
    setMetar(fullData.metar);
    setMetarIcao(upperIcao);
    if (fullData.windData) {
      setData(fullData.windData);
      // Cache the result with airport+hours key
      setCache((prev) => ({ ...prev, [cacheKey]: fullData }));
    } else {
      setError('Failed to fetch data for this airport');
    }
    setLoading(false);
  };

  const handleHoursChange = async (newHours: number) => {
    // Hours change invalidates cache for current airport
    setData(null);
    setMetar(null);
    setHours(newHours);
    setLoading(true);
    setError(null);

    router.push(`?icao=${icao}&hours=${newHours}`, { scroll: false });

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
  };

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);

    // Force refresh to bypass server cache and get fresh data
    const fullData = await getAirportFullData(icao, hours, true);
    setAirport(fullData.airport);
    setMetar(fullData.metar);
    setMetarIcao(icao);
    if (fullData.windData) {
      setData(fullData.windData);
      // Update cache with airport+hours key
      const cacheKey = `${icao}-${hours}`;
      setCache((prev) => ({ ...prev, [cacheKey]: fullData }));
    } else {
      setError('Failed to refresh data');
    }
    setLoading(false);
  };

  // Filter runways by allowed surface types (for charts and table)
  const runways = useMemo(() => {
    const allRunways = airport?.runways || [];
    if (!settings.allowedSurfaces || settings.allowedSurfaces.length === 0) {
      return allRunways;
    }
    return allRunways.filter((rw) => {
      const surface = rw.surface?.toUpperCase() || '';
      return settings.allowedSurfaces.some(
        (allowed) => surface.includes(allowed) || allowed.includes(surface)
      );
    });
  }, [airport?.runways, settings.allowedSurfaces]);

  // Filter forecasts by the hours limit
  const filteredForecasts = useMemo(() => {
    if (!forecast) return [];
    const allForecasts = forecast.forecasts;
    if (forecastHoursLimit >= forecastRange) return allForecasts;

    // Use timestamps to filter: keep only forecasts within limit from the first one
    const baseTimestamp = allForecasts[0]?.timestamp || 0;
    const cutoff = baseTimestamp + forecastHoursLimit * 3600;
    return allForecasts.filter((f) => f.timestamp <= cutoff);
  }, [forecast, forecastHoursLimit, forecastRange]);

  // Ensure selected forecast index stays within the bounds of the filtered forecasts
  useEffect(() => {
    setSelectedForecastIdx((prevIdx) => {
      if (!filteredForecasts.length) {
        return 0;
      }
      const clampedIdx = Math.min(prevIdx, filteredForecasts.length - 1);
      return clampedIdx < 0 ? 0 : clampedIdx;
    });
  }, [filteredForecasts.length]);
  // Get current timestamp once per render cycle for staleness checks
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    // Update timestamp periodically for staleness calculations
    const interval = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Check if synoptic data is stale (>70 minutes old)
  const staleThresholdMs = 70 * 60 * 1000;
  const latestObsTimestamp = data?.observations?.length
    ? Math.max(...data.observations.map((o) => o.timestamp))
    : null;
  const isSynopticStale = latestObsTimestamp
    ? now - latestObsTimestamp * 1000 > staleThresholdMs
    : false;
  const staleMinutes = latestObsTimestamp
    ? Math.round((now - latestObsTimestamp * 1000) / 60000)
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
    <div className="min-h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] p-4 pb-8 lg:flex lg:justify-center">
      <div
        className="w-full"
        style={{ maxWidth: '56rem', marginLeft: 'auto', marginRight: 'auto' }}
      >
        {/* Header */}
        <header className="text-center mb-4">
          <div className="flex items-start justify-between mb-1">
            <div className="w-10" />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold tracking-tight">{icao} <span className="text-[var(--text-tertiary)] font-light">Wind</span></h1>
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="w-10 h-10 flex items-center justify-center text-[var(--text-tertiary)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-secondary)] transition-colors flex-shrink-0"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>
          <p className="text-[var(--text-secondary)] text-sm">
            {data?.name || airport?.name || icao}
            <span className="text-[var(--text-tertiary)]"> &middot; </span>
            {viewMode === 'observations' ? `Last ${hours}h (5-min obs)` : `Next ${forecastHoursLimit}h Forecast`}
          </p>
          {viewMode === 'observations' && lastDataTime && (
            <p className="text-[var(--text-tertiary)] text-xs mt-1">
              Updated {lastDataTime.toLocaleTimeString()}
            </p>
          )}
          {viewMode === 'forecast' && forecast?.generatedAt && (
            <p className="text-[var(--text-tertiary)] text-xs mt-1">
              Forecast issued {new Date(forecast.generatedAt * 1000).toLocaleTimeString()}
            </p>
          )}

          {/* View toggle */}
          <div className="flex justify-center gap-2 mt-3">
            <button
              onClick={() => setViewMode('observations')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                viewMode === 'observations'
                  ? 'bg-[#1d9bf0] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Observations
            </button>
            <button
              onClick={() => setViewMode('forecast')}
              className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                viewMode === 'forecast'
                  ? 'bg-[#10b981] text-white'
                  : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              }`}
            >
              Forecast
            </button>
          </div>

          {/* Forecast range toggle */}
          {viewMode === 'forecast' && (
            <div className="flex justify-center gap-2 mt-2">
              <button
                onClick={() => { setForecastRange(24); setForecastHoursLimit(24); }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  forecastRange === 24
                    ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                24h (hourly)
              </button>
              <button
                onClick={() => { setForecastRange(72); setForecastHoursLimit(72); }}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  forecastRange === 72
                    ? 'bg-[#10b981]/20 text-[#10b981] border border-[#10b981]'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                72h (3-hourly)
              </button>
            </div>
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
            viewMode={viewMode}
            forecastRange={forecastRange}
            forecastHoursLimit={forecastHoursLimit}
            onForecastHoursLimitChange={(h) => {
              setForecastHoursLimit(h);
              setSelectedForecastIdx(0);
            }}
          />
        </div>

        {/* Observations View */}
        {viewMode === 'observations' && (
          <>
            {loading && !data && (
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#1d9bf0] border-t-transparent"></div>
                <p className="text-[var(--text-secondary)] mt-4 text-sm">Loading weather data...</p>
              </div>
            )}

            {error && !data && (
              <>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                  <p className="text-red-400 text-sm">{error}</p>
                  <button
                    onClick={handleRefresh}
                    className="mt-3 px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium"
                  >
                    Retry
                  </button>
                </div>
                <NearbyAirports icao={icao} onSelect={handleAirportChange} />
              </>
            )}

            {data && data.observations.length > 0 && (
              <>
                {/* Stale data warning */}
                {isSynopticStale && !loading && (
                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-3 mb-4 text-center">
                    <p className="text-amber-400 text-sm">
                      Weather data is {staleMinutes} minutes old — observations may be unavailable
                    </p>
                  </div>
                )}

                {/* Charts: stacked on mobile, side-by-side on desktop */}
                <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-stretch">
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
                    metar={metarIcao === icao ? metar : null}
                    now={now}
                  />
                )}
                <NearbyAirports icao={icao} onSelect={handleAirportChange} />
              </>
            )}

            {data && data.observations.length === 0 && (
              <>
                <div className="text-center py-16">
                  <p className="text-[var(--text-secondary)] text-sm">No observations available for this period.</p>
                </div>
                <NearbyAirports icao={icao} onSelect={handleAirportChange} />
              </>
            )}

            <footer className="text-center mt-8 pt-6 border-t border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-tertiary)]">Data from Synoptic Data API (5-min resolution)</p>
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="mt-3 px-4 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 font-medium"
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </footer>
          </>
        )}

        {/* Forecast View */}
        {viewMode === 'forecast' && (
          <>
            {forecastLoading && (
              <div className="text-center py-16">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-[#10b981] border-t-transparent"></div>
                <p className="text-[var(--text-secondary)] mt-4 text-sm">Loading forecast data...</p>
              </div>
            )}

            {forecastError && !forecast && (
              <>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                  <p className="text-red-400 text-sm">{forecastError}</p>
                  <button
                    onClick={() => {
                      setForecast(null);
                      setForecastError(null);
                    }}
                    className="mt-3 px-4 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-lg text-red-400 text-sm font-medium"
                  >
                    Retry
                  </button>
                </div>
                <NearbyAirports icao={icao} onSelect={handleAirportChange} />
              </>
            )}

            {forecast && filteredForecasts.length > 0 && (
              <>
                {/* Forecast Charts: stacked on mobile, side-by-side on desktop */}
                <div className="lg:grid lg:grid-cols-2 lg:gap-5 lg:items-stretch">
                  <div className="lg:min-w-0 lg:flex lg:flex-col">
                    <ForecastChart
                      forecasts={filteredForecasts}
                      selectedIdx={selectedForecastIdx}
                      onSelectIdx={setSelectedForecastIdx}
                    />
                  </div>
                  <div className="lg:min-w-0 lg:flex lg:flex-col">
                    <ForecastDirectionChart
                      forecasts={filteredForecasts}
                      runways={runways}
                      selectedIdx={selectedForecastIdx}
                      onSelectIdx={setSelectedForecastIdx}
                    />
                  </div>
                </div>
                {runways.length > 0 && (
                  <ForecastWindTable
                    forecasts={filteredForecasts}
                    runways={runways}
                    selectedIdx={selectedForecastIdx}
                    onSelectIdx={setSelectedForecastIdx}
                  />
                )}
                <NearbyAirports icao={icao} onSelect={handleAirportChange} />
              </>
            )}

            {forecast && forecast.forecasts.length === 0 && (
              <>
                <div className="text-center py-16">
                  <p className="text-[var(--text-secondary)] text-sm">No forecast data available for this location.</p>
                </div>
                <NearbyAirports icao={icao} onSelect={handleAirportChange} />
              </>
            )}

            <footer className="text-center mt-8 pt-6 border-t border-[var(--border-color)]">
              <p className="text-xs text-[var(--text-tertiary)]">Forecast data from NOAA National Blend of Models (NBM)</p>
              <button
                onClick={() => {
                  setForecast(null);
                  setForecastError(null);
                  loadedForecastRef.current = null;
                }}
                disabled={forecastLoading}
                className="mt-3 px-4 py-1.5 bg-[var(--bg-secondary)] hover:bg-[var(--bg-tertiary)] border border-[var(--border-color)] rounded-lg text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-50 font-medium"
              >
                {forecastLoading ? 'Refreshing...' : 'Refresh Forecast'}
              </button>
            </footer>
          </>
        )}
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

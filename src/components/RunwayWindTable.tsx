'use client';

import { useMemo, useState, useEffect } from 'react';
import { WindDataPoint } from '@/lib/types';
import { Runway, MetarData, getMetar } from '@/app/actions';

interface RunwayWindTableProps {
  observations: WindDataPoint[];
  runways: Runway[];
  icao: string;
  allowedSurfaces?: string[];
}

interface RunwayWindComponent {
  runway: string;
  headwind: number;
  crosswind: number;
  crosswindDir: 'L' | 'R' | '';
  gustHeadwind: number | null;
  gustCrosswind: number | null;
  gustCrosswindDir: 'L' | 'R' | '';
  isFavored: boolean;
}

function calculateWindComponents(
  windDir: number,
  windSpd: number,
  runwayHdg: number
): { headwind: number; crosswind: number; crosswindDir: 'L' | 'R' | '' } {
  const relativeAngle = ((windDir - runwayHdg + 360) % 360) * (Math.PI / 180);
  const headwind = Math.round(windSpd * Math.cos(relativeAngle));
  const crosswindRaw = windSpd * Math.sin(relativeAngle);
  const crosswind = Math.round(Math.abs(crosswindRaw));
  let crosswindDir: 'L' | 'R' | '' = '';
  if (crosswind > 0) {
    crosswindDir = crosswindRaw > 0 ? 'R' : 'L';
  }
  return { headwind, crosswind, crosswindDir };
}

function computeWindComponents(
  windDir: number | null,
  windSpd: number | null,
  gustSpd: number | null,
  runways: Runway[]
): { components: RunwayWindComponent[]; hasGusts: boolean } {
  if (windDir === null || windSpd === null || !runways.length) {
    return { components: [], hasGusts: false };
  }

  const hasGusts = gustSpd !== null && gustSpd > windSpd;
  const results: RunwayWindComponent[] = [];

  for (const runway of runways) {
    // Low end
    const lowHdg = runway.trueHdg;
    const lowComponents = calculateWindComponents(windDir, windSpd, lowHdg);
    const lowGustComponents = hasGusts
      ? calculateWindComponents(windDir, gustSpd!, lowHdg)
      : null;

    results.push({
      runway: runway.low,
      headwind: lowComponents.headwind,
      crosswind: lowComponents.crosswind,
      crosswindDir: lowComponents.crosswindDir,
      gustHeadwind: lowGustComponents?.headwind ?? null,
      gustCrosswind: lowGustComponents?.crosswind ?? null,
      gustCrosswindDir: lowGustComponents?.crosswindDir ?? '',
      isFavored: false,
    });

    // High end
    const highHdg = (runway.trueHdg + 180) % 360;
    const highComponents = calculateWindComponents(windDir, windSpd, highHdg);
    const highGustComponents = hasGusts
      ? calculateWindComponents(windDir, gustSpd!, highHdg)
      : null;

    results.push({
      runway: runway.high,
      headwind: highComponents.headwind,
      crosswind: highComponents.crosswind,
      crosswindDir: highComponents.crosswindDir,
      gustHeadwind: highGustComponents?.headwind ?? null,
      gustCrosswind: highGustComponents?.crosswind ?? null,
      gustCrosswindDir: highGustComponents?.crosswindDir ?? '',
      isFavored: false,
    });
  }

  // Find favored runway
  if (results.length > 0) {
    const maxHeadwind = Math.max(...results.map((r) => r.headwind));
    const favoredCandidates = results.filter((r) => r.headwind === maxHeadwind);
    const favored = favoredCandidates.reduce((best, curr) =>
      curr.crosswind < best.crosswind ? curr : best
    );
    favored.isFavored = true;
  }

  results.sort((a, b) => b.headwind - a.headwind);

  return { components: results, hasGusts };
}

export default function RunwayWindTable({
  observations,
  runways,
  icao,
  allowedSurfaces,
}: RunwayWindTableProps) {
  const [source, setSource] = useState<'5min' | 'metar'>('5min');
  const [metarData, setMetarData] = useState<MetarData | null>(null);
  const [metarLoading, setMetarLoading] = useState(false);

  // Filter runways by allowed surface types
  const filteredRunways = useMemo(() => {
    if (!allowedSurfaces || allowedSurfaces.length === 0) return runways;
    return runways.filter((rw) => {
      // Check if runway surface matches any allowed surface (including partial matches)
      const surface = rw.surface?.toUpperCase() || '';
      return allowedSurfaces.some((allowed) => 
        surface.includes(allowed) || allowed.includes(surface)
      );
    });
  }, [runways, allowedSurfaces]);

  // Clear METAR data when airport changes
  useEffect(() => {
    setMetarData(null);
  }, [icao]);

  // Fetch METAR when source changes to metar or airport changes
  useEffect(() => {
    if (source === 'metar' && icao) {
      setMetarLoading(true);
      getMetar(icao)
        .then((data) => setMetarData(data))
        .catch(() => setMetarData(null))
        .finally(() => setMetarLoading(false));
    }
  }, [source, icao]);

  // Get wind data from 5-min observations
  const synopticWind = useMemo(() => {
    const recentObs = [...observations]
      .reverse()
      .find((o) => o.wdir !== null && o.wspd !== null);
    if (!recentObs) return null;
    return {
      wdir: recentObs.wdir,
      wspd: recentObs.wspd,
      wgst: recentObs.wgst,
      time: recentObs.time,
    };
  }, [observations]);

  // Check if METAR is stale (>70 minutes old)
  const staleThresholdMs = 70 * 60 * 1000;
  const isMetarStale = metarData?.obsTime
    ? Date.now() - metarData.obsTime * 1000 > staleThresholdMs
    : false;
  const metarStaleMinutes = metarData?.obsTime
    ? Math.round((Date.now() - metarData.obsTime * 1000) / 60000)
    : 0;

  // Compute wind components based on selected source
  const { windComponents, hasGusts, sourceInfo, sourceTime } = useMemo(() => {
    if (source === 'metar') {
      // Only use METAR data when METAR is selected
      if (!metarData) {
        return { windComponents: [], hasGusts: false, sourceInfo: '', sourceTime: null };
      }
      const { components, hasGusts } = computeWindComponents(
        metarData.wdir,
        metarData.wspd,
        metarData.wgst,
        filteredRunways
      );
      const metarTime = metarData.obsTime
        ? new Date(metarData.obsTime * 1000).toISOString().slice(11, 16) + 'Z'
        : '';
      return {
        windComponents: components,
        hasGusts,
        sourceInfo: metarData.rawOb || 'METAR',
        sourceTime: metarTime,
      };
    } else if (source === '5min' && synopticWind) {
      const { components, hasGusts } = computeWindComponents(
        synopticWind.wdir,
        synopticWind.wspd,
        synopticWind.wgst,
        filteredRunways
      );
      return {
        windComponents: components,
        hasGusts,
        sourceInfo: `Last observation: ${synopticWind.time} local`,
        sourceTime: null,
      };
    }
    return { windComponents: [], hasGusts: false, sourceInfo: '', sourceTime: null };
  }, [source, metarData, synopticWind, filteredRunways]);

  if (!filteredRunways.length) return null;
  if (source === '5min' && !synopticWind) return null;

  return (
    <div className="chart-section mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="chart-title mb-0">🛬 Runway Wind Components</div>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setSource('5min')}
            className={`px-2 py-1 rounded transition-colors ${
              source === '5min'
                ? 'bg-[#1d9bf0] text-white'
                : 'bg-[#38444d] text-[#8899a6] hover:bg-[#4a5568]'
            }`}
          >
            5-min
          </button>
          <button
            onClick={() => setSource('metar')}
            className={`px-2 py-1 rounded transition-colors ${
              source === 'metar'
                ? 'bg-[#1d9bf0] text-white'
                : 'bg-[#38444d] text-[#8899a6] hover:bg-[#4a5568]'
            }`}
          >
            METAR
          </button>
        </div>
      </div>

      {/* Stale METAR warning */}
      {source === 'metar' && isMetarStale && metarData && (
        <div className="bg-yellow-900/30 border border-yellow-500/50 rounded-lg p-2 mb-3 text-center">
          <p className="text-yellow-400 text-xs">
            ⚠️ METAR is {metarStaleMinutes} minutes old
          </p>
        </div>
      )}

      {metarLoading && source === 'metar' ? (
        <div className="text-center py-4">
          <div className="inline-block animate-spin rounded-full h-5 w-5 border-2 border-[#1d9bf0] border-t-transparent"></div>
        </div>
      ) : windComponents.length === 0 ? (
        <div className="text-center py-4 text-[#8899a6] text-sm">
          <p>No wind data available</p>
          {source === 'metar' && metarData?.rawOb && (
            <p className="font-mono text-xs mt-2 break-all">{metarData.rawOb}</p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#8899a6] border-b border-[#38444d]">
                  <th className="py-2 px-3 text-left font-medium">Runway</th>
                  <th className="py-2 px-3 text-right font-medium">Headwind</th>
                  <th className="py-2 px-3 text-right font-medium">Crosswind</th>
                </tr>
              </thead>
              <tbody>
                {windComponents.map((wc) => (
                  <tr
                    key={wc.runway}
                    className={`border-b border-[#38444d]/50 ${
                      wc.isFavored ? 'bg-[#1d9bf0]/20' : ''
                    }`}
                  >
                    <td className="py-2 px-3">
                      <span
                        className={`font-mono font-bold ${
                          wc.isFavored ? 'text-[#1d9bf0]' : 'text-white'
                        }`}
                      >
                        {wc.runway}
                      </span>
                      {wc.isFavored && (
                        <span className="ml-2 text-xs text-[#1d9bf0]">★</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      <span className={wc.headwind >= 0 ? 'text-green-400' : 'text-red-400'}>
                        {wc.headwind >= 0 ? '+' : ''}{wc.headwind}
                      </span>
                      {wc.gustHeadwind !== null && (
                        <span className="text-[#8899a6]">
                          {' '}({wc.gustHeadwind >= 0 ? '+' : ''}{wc.gustHeadwind})
                        </span>
                      )}
                      <span className="text-[#8899a6]"> kt</span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono">
                      <span className="text-yellow-400">
                        {wc.crosswind}{wc.crosswindDir && ` ${wc.crosswindDir}`}
                      </span>
                      {wc.gustCrosswind !== null && (
                        <span className="text-[#8899a6]">
                          {' '}({wc.gustCrosswind}{wc.gustCrosswindDir && ` ${wc.gustCrosswindDir}`})
                        </span>
                      )}
                      <span className="text-[#8899a6]"> kt</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-[#8899a6] mt-2 text-center">
            <p className={`${source === 'metar' ? 'font-mono break-all' : ''}`}>
              {sourceInfo}
            </p>
            {hasGusts && <p className="mt-1">• (gust values in parentheses)</p>}
          </div>
        </>
      )}
    </div>
  );
}

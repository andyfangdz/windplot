'use client';

import { useMemo, useState } from 'react';
import { WindDataPoint } from '@/lib/types';
import { Runway, MetarData } from '@/app/actions';

interface RunwayWindTableProps {
  observations: WindDataPoint[];
  runways: Runway[]; // Pre-filtered by surface type in parent
  metar: MetarData | null;
  now: number; // Current timestamp for staleness checks
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
  lda: number;
  width: number;
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
      lda: runway.lowLda ?? runway.length,
      width: runway.width,
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
      lda: runway.highLda ?? runway.length,
      width: runway.width,
    });
  }

  // Find favored runway (guard against NaN headwind values causing empty filter result)
  if (results.length > 0) {
    const maxHeadwind = Math.max(...results.map((r) => r.headwind));
    const favoredCandidates = results.filter((r) => r.headwind === maxHeadwind);
    if (favoredCandidates.length > 0) {
      const favored = favoredCandidates.reduce((best, curr) =>
        curr.crosswind < best.crosswind ? curr : best
      );
      favored.isFavored = true;
    }
  }

  results.sort((a, b) => b.headwind - a.headwind);

  return { components: results, hasGusts };
}

export default function RunwayWindTable({
  observations,
  runways,
  metar,
  now,
}: RunwayWindTableProps) {
  const [source, setSource] = useState<'5min' | 'metar'>('5min');

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
  const { isMetarStale, metarStaleMinutes } = useMemo(() => {
    const staleThresholdMs = 70 * 60 * 1000;
    const isStale = metar?.obsTime
      ? now - metar.obsTime * 1000 > staleThresholdMs
      : false;
    const staleMinutes = metar?.obsTime
      ? Math.round((now - metar.obsTime * 1000) / 60000)
      : 0;
    return { isMetarStale: isStale, metarStaleMinutes: staleMinutes };
  }, [metar, now]);

  // Compute wind components based on selected source
  const { windComponents, hasGusts, sourceInfo } = useMemo(() => {
    if (source === 'metar') {
      if (!metar) {
        return { windComponents: [], hasGusts: false, sourceInfo: '' };
      }
      const { components, hasGusts } = computeWindComponents(
        metar.wdir,
        metar.wspd,
        metar.wgst,
        runways
      );
      return {
        windComponents: components,
        hasGusts,
        sourceInfo: metar.rawOb || 'METAR',
      };
    } else if (source === '5min' && synopticWind) {
      const { components, hasGusts } = computeWindComponents(
        synopticWind.wdir,
        synopticWind.wspd,
        synopticWind.wgst,
        runways
      );
      return {
        windComponents: components,
        hasGusts,
        sourceInfo: `Last observation: ${synopticWind.time} local`,
      };
    }
    return { windComponents: [], hasGusts: false, sourceInfo: '' };
  }, [source, metar, synopticWind, runways]);

  if (!runways.length) return null;
  if (source === '5min' && !synopticWind) return null;

  return (
    <div className="chart-section mt-4">
      <div className="flex items-center justify-between mb-3">
        <div className="chart-title mb-0">Runway Wind Components</div>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setSource('5min')}
            className={`px-2 py-1 rounded transition-colors ${
              source === '5min'
                ? 'bg-[#1d9bf0] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            5-min
          </button>
          <button
            onClick={() => setSource('metar')}
            className={`px-2 py-1 rounded transition-colors ${
              source === 'metar'
                ? 'bg-[#1d9bf0] text-white'
                : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
            }`}
          >
            METAR
          </button>
        </div>
      </div>

      {/* Stale METAR warning */}
      {source === 'metar' && isMetarStale && metar && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2 mb-3 text-center">
          <p className="text-amber-400 text-xs">
            METAR is {metarStaleMinutes} minutes old
          </p>
        </div>
      )}

      {windComponents.length === 0 ? (
        <div className="text-center py-4 text-[var(--text-secondary)] text-sm">
          <p>No wind data available</p>
          {source === 'metar' && metar?.rawOb && (
            <p className="font-mono text-xs mt-2 break-all text-[var(--text-tertiary)]">{metar.rawOb}</p>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-[var(--border-color)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--text-tertiary)] bg-[var(--bg-primary)]/50 border-b border-[var(--border-color)]">
                  <th className="py-2.5 px-3 text-left font-medium text-xs uppercase tracking-wider">Runway</th>
                  <th className="py-2.5 px-3 text-right font-medium text-xs uppercase tracking-wider">LDA</th>
                  <th className="py-2.5 px-3 text-right font-medium text-xs uppercase tracking-wider">Width</th>
                  <th className="py-2.5 px-3 text-right font-medium text-xs uppercase tracking-wider">Headwind</th>
                  <th className="py-2.5 px-3 text-right font-medium text-xs uppercase tracking-wider">Crosswind</th>
                </tr>
              </thead>
              <tbody>
                {windComponents.map((wc) => (
                  <tr
                    key={wc.runway}
                    className={`border-b border-[var(--border-color)] last:border-b-0 transition-colors ${
                      wc.isFavored ? 'bg-[#1d9bf0]/10' : 'hover:bg-[var(--bg-primary)]/30'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-mono font-bold ${
                          wc.isFavored ? 'text-[#1d9bf0]' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {wc.runway}
                      </span>
                      {wc.isFavored && (
                        <span className="ml-2 text-xs text-[#1d9bf0]">&#9733;</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                      {wc.lda.toLocaleString()}&apos;
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                      {wc.width}&apos;
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span className={wc.headwind >= 0 ? 'text-emerald-400' : 'text-red-400'}>
                        {wc.headwind >= 0 ? '+' : ''}{wc.headwind}
                      </span>
                      {wc.gustHeadwind !== null && (
                        <span className="text-[var(--text-tertiary)]">
                          {' '}({wc.gustHeadwind >= 0 ? '+' : ''}{wc.gustHeadwind})
                        </span>
                      )}
                      <span className="text-[var(--text-tertiary)]"> kt</span>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                      <span className="text-amber-400">
                        {wc.crosswind}{wc.crosswindDir && ` ${wc.crosswindDir}`}
                      </span>
                      {wc.gustCrosswind !== null && (
                        <span className="text-[var(--text-tertiary)]">
                          {' '}({wc.gustCrosswind}{wc.gustCrosswindDir && ` ${wc.gustCrosswindDir}`})
                        </span>
                      )}
                      <span className="text-[var(--text-tertiary)]"> kt</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-[var(--text-tertiary)] mt-3 text-center">
            <p className={`${source === 'metar' ? 'font-mono break-all' : ''}`}>
              {sourceInfo}
            </p>
            {hasGusts && <p className="mt-1">Gust values in parentheses</p>}
          </div>
        </>
      )}
    </div>
  );
}

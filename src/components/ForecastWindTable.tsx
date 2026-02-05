'use client';

import { useMemo } from 'react';
import { ForecastDataPoint } from '@/lib/types';
import { Runway } from '@/app/actions';

interface ForecastWindTableProps {
  forecasts: ForecastDataPoint[];
  runways: Runway[];
  selectedIdx: number;
  onSelectIdx: (idx: number) => void;
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

  // Find favored runway
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

// Extract short hour label from time string
// Handles both "3:00 PM" (24h) and "Wed, 3 PM" (72h) formats
function getShortHourLabel(time: string): string {
  // Try 72h format first: "Wed, 3 PM" -> "W3P"
  const weekdayMatch = time.match(/(\w{3}),?\s*(\d{1,2})\s*(AM|PM)/i);
  if (weekdayMatch) {
    const day = weekdayMatch[1][0].toUpperCase(); // First letter of day
    const hour = weekdayMatch[2];
    const ampm = weekdayMatch[3].toUpperCase()[0];
    return `${day}${hour}${ampm}`;
  }

  // Try 24h format: "3:00 PM" -> "3P"
  const hourMatch = time.match(/(\d{1,2}):\d{2}\s*(AM|PM)/i);
  if (hourMatch) {
    const hour = hourMatch[1];
    const ampm = hourMatch[2].toUpperCase()[0];
    return `${hour}${ampm}`;
  }

  return time;
}

export default function ForecastWindTable({
  forecasts,
  runways,
  selectedIdx,
  onSelectIdx,
}: ForecastWindTableProps) {
  // Build hour options for all forecast hours
  const hourOptions = useMemo(() => {
    const baseTimestamp = forecasts[0]?.timestamp || 0;
    return forecasts.map((f, idx) => {
      // Calculate relative hours from first forecast
      const relativeHours = Math.round((f.timestamp - baseTimestamp) / 3600);
      return {
        idx,
        time: f.time,
        shortLabel: getShortHourLabel(f.time),
        relativeHours,
      };
    });
  }, [forecasts]);

  // Get selected forecast
  const selectedForecast = forecasts[selectedIdx];

  // Compute wind components for selected forecast
  const { components: windComponents, hasGusts } = useMemo(() => {
    if (!selectedForecast) {
      return { components: [], hasGusts: false };
    }
    return computeWindComponents(
      selectedForecast.wdir,
      selectedForecast.wspd,
      selectedForecast.wgst,
      runways
    );
  }, [selectedForecast, runways]);

  if (!runways.length || forecasts.length === 0) return null;

  return (
    <div className="chart-section mt-4">
      <div className="mb-3">
        <div className="chart-title mb-2">Forecast Runway Winds</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--text-tertiary)] whitespace-nowrap font-medium">Hour:</span>
          <div className="flex gap-1 text-xs overflow-x-auto pb-1 flex-1" style={{ scrollbarWidth: 'thin' }}>
            {hourOptions.map((opt) => (
              <button
                key={opt.idx}
                onClick={() => onSelectIdx(opt.idx)}
                className={`px-1.5 py-1 rounded-md transition-all whitespace-nowrap flex-shrink-0 min-w-[36px] ${
                  selectedIdx === opt.idx
                    ? 'bg-[#10b981] text-white font-medium shadow-[0_0_8px_rgba(16,185,129,0.3)]'
                    : 'bg-[var(--bg-primary)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:border-[var(--border-color-strong)] hover:text-[var(--text-primary)]'
                }`}
                title={`Forecast for ${opt.time}`}
              >
                <div className="text-[10px] leading-tight">{opt.shortLabel}</div>
                <div className="text-[9px] leading-tight opacity-70">
                  {opt.relativeHours === 0 ? 'Now' : `+${opt.relativeHours}h`}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {windComponents.length === 0 ? (
        <div className="text-center py-4 text-[var(--text-secondary)] text-sm">
          <p>No forecast wind data available</p>
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
                      wc.isFavored ? 'bg-[#10b981]/10' : 'hover:bg-[var(--bg-primary)]/30'
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-mono font-bold ${
                          wc.isFavored ? 'text-[#10b981]' : 'text-[var(--text-primary)]'
                        }`}
                      >
                        {wc.runway}
                      </span>
                      {wc.isFavored && (
                        <span className="ml-2 text-xs text-[#10b981]">&#9733;</span>
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
            <p>
              Forecast for {selectedForecast?.time}
              {selectedForecast?.temp !== null && selectedForecast?.temp !== undefined && (
                <> &middot; {selectedForecast.temp}&deg;F</>
              )}
              {selectedForecast?.pop !== null && selectedForecast?.pop !== undefined && selectedForecast.pop > 0 && (
                <> &middot; {selectedForecast.pop}% precip</>
              )}
            </p>
            {hasGusts && <p className="mt-1">Gust values in parentheses</p>}
          </div>
        </>
      )}
    </div>
  );
}

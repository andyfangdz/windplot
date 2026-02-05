'use client';

import { useMemo, useState } from 'react';
import { ForecastDataPoint } from '@/lib/types';
import { Runway } from '@/app/actions';

interface ForecastWindTableProps {
  forecasts: ForecastDataPoint[];
  runways: Runway[];
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

export default function ForecastWindTable({
  forecasts,
  runways,
}: ForecastWindTableProps) {
  // Allow selecting a specific forecast hour
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Build hour options for all 24 forecast hours
  const hourOptions = useMemo(() => {
    return forecasts.map((f, idx) => ({
      idx,
      time: f.time,
      // Extract just the hour for compact display
      hourLabel: f.time.replace(/:00\s*(AM|PM)/i, ' $1').replace(/\s+/g, ''),
    }));
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
        <div className="chart-title mb-2">🛬 Forecast Runway Winds</div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[#8899a6] whitespace-nowrap">Hour:</span>
          <div className="flex gap-1 text-xs overflow-x-auto pb-1 flex-1" style={{ scrollbarWidth: 'thin' }}>
            {hourOptions.map((opt, i) => (
              <button
                key={opt.idx}
                onClick={() => setSelectedIdx(opt.idx)}
                className={`px-2 py-1 rounded transition-colors whitespace-nowrap flex-shrink-0 ${
                  selectedIdx === opt.idx
                    ? 'bg-[#10b981] text-white font-medium'
                    : 'bg-[#38444d] text-[#8899a6] hover:bg-[#4a5568]'
                }`}
                title={`Forecast for ${opt.time}`}
              >
                {i === 0 ? 'Now' : `+${i}h`}
              </button>
            ))}
          </div>
        </div>
      </div>

      {windComponents.length === 0 ? (
        <div className="text-center py-4 text-[#8899a6] text-sm">
          <p>No forecast wind data available</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[#8899a6] border-b border-[#38444d]">
                  <th className="py-2 px-3 text-left font-medium">Runway</th>
                  <th className="py-2 px-3 text-right font-medium">LDA</th>
                  <th className="py-2 px-3 text-right font-medium">Width</th>
                  <th className="py-2 px-3 text-right font-medium">Headwind</th>
                  <th className="py-2 px-3 text-right font-medium">Crosswind</th>
                </tr>
              </thead>
              <tbody>
                {windComponents.map((wc) => (
                  <tr
                    key={wc.runway}
                    className={`border-b border-[#38444d]/50 ${
                      wc.isFavored ? 'bg-[#10b981]/20' : ''
                    }`}
                  >
                    <td className="py-2 px-3">
                      <span
                        className={`font-mono font-bold ${
                          wc.isFavored ? 'text-[#10b981]' : 'text-white'
                        }`}
                      >
                        {wc.runway}
                      </span>
                      {wc.isFavored && (
                        <span className="ml-2 text-xs text-[#10b981]">★</span>
                      )}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[#8899a6]">
                      {wc.lda.toLocaleString()}&apos;
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-[#8899a6]">
                      {wc.width}&apos;
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
            <p>
              Forecast for {selectedForecast?.time}
              {selectedForecast?.temp !== null && selectedForecast?.temp !== undefined && (
                <> • {selectedForecast.temp}°F</>
              )}
              {selectedForecast?.pop !== null && selectedForecast?.pop !== undefined && selectedForecast.pop > 0 && (
                <> • {selectedForecast.pop}% precip</>
              )}
            </p>
            {hasGusts && <p className="mt-1">• (gust values in parentheses)</p>}
          </div>
        </>
      )}
    </div>
  );
}

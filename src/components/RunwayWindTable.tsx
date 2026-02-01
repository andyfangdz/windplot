'use client';

import { useMemo } from 'react';
import { WindDataPoint } from '@/lib/types';
import { Runway } from '@/app/actions';

interface RunwayWindTableProps {
  observations: WindDataPoint[];
  runways: Runway[];
}

interface RunwayWindComponent {
  runway: string;
  headwind: number; // positive = headwind, negative = tailwind
  crosswind: number; // absolute value
  crosswindDir: 'L' | 'R' | ''; // left or right
  isFavored: boolean;
}

function calculateWindComponents(
  windDir: number,
  windSpd: number,
  runwayHdg: number
): { headwind: number; crosswind: number; crosswindDir: 'L' | 'R' | '' } {
  // Calculate the angle between wind direction and runway heading
  // Wind direction is where wind comes FROM, runway heading is the direction you land
  const relativeAngle = ((windDir - runwayHdg + 360) % 360) * (Math.PI / 180);
  
  // Headwind component (positive = headwind, negative = tailwind)
  const headwind = Math.round(windSpd * Math.cos(relativeAngle));
  
  // Crosswind component (absolute value)
  const crosswindRaw = windSpd * Math.sin(relativeAngle);
  const crosswind = Math.round(Math.abs(crosswindRaw));
  
  // Determine crosswind direction (from pilot's perspective landing on runway)
  // Positive sin = wind from the right, negative = from the left
  let crosswindDir: 'L' | 'R' | '' = '';
  if (crosswind > 0) {
    crosswindDir = crosswindRaw > 0 ? 'R' : 'L';
  }
  
  return { headwind, crosswind, crosswindDir };
}

export default function RunwayWindTable({
  observations,
  runways,
}: RunwayWindTableProps) {
  const windComponents = useMemo(() => {
    if (!runways.length || !observations.length) return [];

    // Get the most recent observation with wind data
    const recentObs = [...observations]
      .reverse()
      .find((o) => o.wdir !== null && o.wspd !== null);

    if (!recentObs || recentObs.wdir === null || recentObs.wspd === null) {
      return [];
    }

    const windDir = recentObs.wdir;
    const windSpd = recentObs.wspd;

    // Calculate components for each runway end
    const results: RunwayWindComponent[] = [];

    for (const runway of runways) {
      // Low end (e.g., "04")
      const lowHdg = runway.trueHdg;
      const lowComponents = calculateWindComponents(windDir, windSpd, lowHdg);
      results.push({
        runway: runway.low,
        headwind: lowComponents.headwind,
        crosswind: lowComponents.crosswind,
        crosswindDir: lowComponents.crosswindDir,
        isFavored: false,
      });

      // High end (e.g., "22") - opposite direction
      const highHdg = (runway.trueHdg + 180) % 360;
      const highComponents = calculateWindComponents(windDir, windSpd, highHdg);
      results.push({
        runway: runway.high,
        headwind: highComponents.headwind,
        crosswind: highComponents.crosswind,
        crosswindDir: highComponents.crosswindDir,
        isFavored: false,
      });
    }

    // Find the favored runway (highest headwind, or if tied, lowest crosswind)
    if (results.length > 0) {
      const maxHeadwind = Math.max(...results.map((r) => r.headwind));
      const favoredCandidates = results.filter((r) => r.headwind === maxHeadwind);
      const favored = favoredCandidates.reduce((best, curr) =>
        curr.crosswind < best.crosswind ? curr : best
      );
      favored.isFavored = true;
    }

    // Sort by headwind descending
    results.sort((a, b) => b.headwind - a.headwind);

    return results;
  }, [observations, runways]);

  if (windComponents.length === 0) {
    return null;
  }

  return (
    <div className="chart-section mt-4">
      <div className="chart-title">🛬 Runway Wind Components</div>
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
                    <span className="ml-2 text-xs text-[#1d9bf0]">★ favored</span>
                  )}
                </td>
                <td
                  className={`py-2 px-3 text-right font-mono ${
                    wc.headwind >= 0 ? 'text-green-400' : 'text-red-400'
                  }`}
                >
                  {wc.headwind >= 0 ? '+' : ''}
                  {wc.headwind} kt
                </td>
                <td className="py-2 px-3 text-right font-mono text-yellow-400">
                  {wc.crosswind > 0
                    ? `${wc.crosswind} kt ${wc.crosswindDir}`
                    : '0 kt'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-[#8899a6] mt-2 text-center">
        Based on most recent observation
      </p>
    </div>
  );
}

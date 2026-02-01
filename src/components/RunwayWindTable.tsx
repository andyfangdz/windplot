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

export default function RunwayWindTable({
  observations,
  runways,
}: RunwayWindTableProps) {
  const { windComponents, hasGusts } = useMemo(() => {
    if (!runways.length || !observations.length) return { windComponents: [], hasGusts: false };

    const recentObs = [...observations]
      .reverse()
      .find((o) => o.wdir !== null && o.wspd !== null);

    if (!recentObs || recentObs.wdir === null || recentObs.wspd === null) {
      return { windComponents: [], hasGusts: false };
    }

    const windDir = recentObs.wdir;
    const windSpd = recentObs.wspd;
    const gustSpd = recentObs.wgst;
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

    return { windComponents: results, hasGusts };
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
                <td className="py-2 px-3 text-right font-mono">
                  <span className={wc.headwind >= 0 ? 'text-green-400' : 'text-red-400'}>
                    {wc.headwind >= 0 ? '+' : ''}{wc.headwind}
                  </span>
                  {wc.gustHeadwind !== null && (
                    <span className={`text-[#8899a6] ${wc.gustHeadwind >= 0 ? '' : 'text-red-400/70'}`}>
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
      <p className="text-xs text-[#8899a6] mt-2 text-center">
        Based on most recent observation{hasGusts && ' • (gust values)'}
      </p>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { getNearbyAirports, getMetarBatch, NearbyAirport, MetarData } from '@/app/actions';

interface NearbyAirportsProps {
  icao: string;
  onSelect: (icao: string) => void;
}

function formatWind(metar: MetarData | undefined): string {
  if (!metar || metar.wdir === null || metar.wspd === null) return '—';
  const dir = String(metar.wdir).padStart(3, '0');
  const spd = metar.wspd;
  if (metar.wgst !== null && metar.wgst > spd) {
    return `${dir}@${spd}G${metar.wgst}`;
  }
  return `${dir}@${spd}`;
}

export default function NearbyAirports({ icao, onSelect }: NearbyAirportsProps) {
  const [nearby, setNearby] = useState<NearbyAirport[]>([]);
  const [metars, setMetars] = useState<Record<string, MetarData>>({});
  const [loadedIcao, setLoadedIcao] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    getNearbyAirports(icao, 30, 10).then((airports) => {
      if (fetchIdRef.current !== fetchId) return;
      setNearby(airports);
      setLoadedIcao(icao);

      // Fetch METARs for all nearby airports
      const icaos = airports.map((a) => a.icao);
      if (icaos.length > 0) {
        getMetarBatch(icaos).then((data) => {
          if (fetchIdRef.current === fetchId) {
            setMetars(data);
          }
        });
      }
    });
  }, [icao]);

  const loading = loadedIcao !== icao;

  if (loading) {
    return (
      <div className="chart-section mt-4">
        <div className="flex items-center gap-2 text-[var(--text-secondary)] text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-[#1d9bf0] border-t-transparent"></div>
          Finding nearby airports...
        </div>
      </div>
    );
  }

  if (nearby.length === 0) {
    return null;
  }

  const displayedAirports = expanded ? nearby : nearby.slice(0, 5);

  return (
    <div className="chart-section mt-4">
      <div className="chart-title">Nearby Airports</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[var(--text-tertiary)] bg-[var(--bg-primary)]/50 border-b border-[var(--border-color)]">
              <th className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wider">ICAO</th>
              <th className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wider hidden sm:table-cell">Name</th>
              <th className="py-2 px-3 text-right font-medium text-xs uppercase tracking-wider">Dist</th>
              <th className="py-2 px-3 text-right font-medium text-xs uppercase tracking-wider">Wind</th>
            </tr>
          </thead>
          <tbody>
            {displayedAirports.map((airport) => {
              const metar = metars[airport.icao];
              const wind = formatWind(metar);
              const hasGust = metar?.wgst !== null && metar?.wgst !== undefined && metar.wspd !== null && metar.wgst > metar.wspd;
              return (
                <tr
                  key={airport.icao}
                  onClick={() => onSelect(airport.icao)}
                  className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                >
                  <td className="py-2 px-3">
                    <span className="font-mono text-[#1d9bf0] font-bold">{airport.icao}</span>
                  </td>
                  <td className="py-2 px-3 text-[var(--text-secondary)] truncate max-w-[200px] hidden sm:table-cell">
                    {airport.name}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                    {airport.distance}nm
                  </td>
                  <td className="py-2 px-3 text-right font-mono tabular-nums">
                    {wind === '—' ? (
                      <span className="text-[var(--text-tertiary)]">—</span>
                    ) : (
                      <span className={hasGust ? 'text-amber-400' : 'text-[var(--text-primary)]'}>
                        {wind}
                      </span>
                    )}
                    {wind !== '—' && <span className="text-[var(--text-tertiary)]"> kt</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {nearby.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-[#1d9bf0] text-sm hover:underline w-full text-center font-medium"
        >
          {expanded ? 'Show less' : `Show ${nearby.length - 5} more`}
        </button>
      )}
    </div>
  );
}

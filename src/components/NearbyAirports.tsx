'use client';

import { useState, useEffect, useRef } from 'react';
import { getNearbyAirports, getMetarBatch, NearbyAirport, MetarData } from '@/app/actions';

interface NearbyAirportsProps {
  icao: string;
  onSelect: (icao: string) => void;
  showWind?: boolean;
}

type WindDisplay = { text: string; style: 'normal' | 'calm' | 'gust' | 'missing' | 'loading' };

function formatWind(metar: MetarData | undefined, metarsLoaded: boolean): WindDisplay {
  if (!metarsLoaded) return { text: '...', style: 'loading' };
  if (!metar) return { text: 'MISSING', style: 'missing' };
  if (metar.wspd === 0 || (metar.wdir === null && metar.wspd === null)) {
    // wspd=0 is calm; wdir=null + wspd=null means no data
    if (metar.wspd === 0) return { text: 'CALM', style: 'calm' };
    return { text: 'MISSING', style: 'missing' };
  }
  if (metar.wdir === null || metar.wspd === null) return { text: 'MISSING', style: 'missing' };
  const dir = String(metar.wdir).padStart(3, '0');
  const spd = metar.wspd;
  if (metar.wgst !== null && metar.wgst > spd) {
    return { text: `${dir}@${spd}G${metar.wgst}`, style: 'gust' };
  }
  return { text: `${dir}@${spd}`, style: 'normal' };
}

export default function NearbyAirports({ icao, onSelect, showWind = true }: NearbyAirportsProps) {
  const [nearby, setNearby] = useState<NearbyAirport[]>([]);
  const [metars, setMetars] = useState<Record<string, MetarData>>({});
  const [metarsLoadedIcao, setMetarsLoadedIcao] = useState<string | null>(null);
  const [loadedIcao, setLoadedIcao] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fetchIdRef = useRef(0);

  const metarsLoaded = metarsLoadedIcao === icao;

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    getNearbyAirports(icao, 30, 10).then((airports) => {
      if (fetchIdRef.current !== fetchId) return;
      setNearby(airports);
      setLoadedIcao(icao);

      // Fetch METARs for all nearby airports (only in observations view)
      if (showWind) {
        const icaos = airports.map((a) => a.icao);
        if (icaos.length > 0) {
          getMetarBatch(icaos).then((data) => {
            if (fetchIdRef.current === fetchId) {
              setMetars(data);
              setMetarsLoadedIcao(icao);
            }
          });
        }
      }
    });
  }, [icao, showWind]);

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
              <th className="py-2 px-3 text-left font-medium text-xs uppercase tracking-wider">Name</th>
              <th className="py-2 px-3 text-right font-medium text-xs uppercase tracking-wider">Dist</th>
              {showWind && <th className="py-2 px-3 text-right font-medium text-xs uppercase tracking-wider">Wind</th>}
            </tr>
          </thead>
          <tbody>
            {displayedAirports.map((airport) => {
              const wind = showWind ? formatWind(metars[airport.icao], metarsLoaded) : null;
              const windColorClass = wind
                ? wind.style === 'gust' ? 'text-amber-400' :
                  wind.style === 'missing' ? 'text-amber-400' :
                  wind.style === 'calm' ? 'text-[var(--text-tertiary)]' :
                  wind.style === 'loading' ? 'text-[var(--text-tertiary)]' :
                  'text-[var(--text-primary)]'
                : '';
              const showUnit = wind && (wind.style === 'normal' || wind.style === 'gust');
              return (
                <tr
                  key={airport.icao}
                  onClick={() => onSelect(airport.icao)}
                  className="border-b border-[var(--border-color)] last:border-b-0 hover:bg-[var(--bg-hover)] cursor-pointer transition-colors"
                >
                  <td className="py-2 px-3">
                    <span className="font-mono text-[#1d9bf0] font-bold">{airport.icao}</span>
                  </td>
                  <td className="py-2 px-3 text-[var(--text-secondary)] truncate max-w-[200px]">
                    {airport.name}
                  </td>
                  <td className="py-2 px-3 text-right font-mono text-[var(--text-secondary)] tabular-nums">
                    {airport.distance}nm
                  </td>
                  {wind && (
                    <td className="py-2 px-3 text-right font-mono tabular-nums">
                      <span className={windColorClass}>{wind.text}</span>
                      {showUnit && <span className="text-[var(--text-tertiary)]"> kt</span>}
                    </td>
                  )}
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

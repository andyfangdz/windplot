'use client';

import { useState, useEffect, useRef } from 'react';
import { getNearbyAirports, NearbyAirport } from '@/app/actions';

interface NearbyAirportsProps {
  icao: string;
  onSelect: (icao: string) => void;
}

export default function NearbyAirports({ icao, onSelect }: NearbyAirportsProps) {
  const [nearby, setNearby] = useState<NearbyAirport[]>([]);
  const [loadedIcao, setLoadedIcao] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const fetchIdRef = useRef(0);

  useEffect(() => {
    const fetchId = ++fetchIdRef.current;
    getNearbyAirports(icao, 30, 10).then((airports) => {
      // Check if this fetch is still current (handle race condition)
      if (fetchIdRef.current === fetchId) {
        setNearby(airports);
        setLoadedIcao(icao);
      }
    });
  }, [icao]);

  const loading = loadedIcao !== icao;

  if (loading) {
    return (
      <div className="bg-[#192734] rounded-lg p-4 mt-4">
        <div className="flex items-center gap-2 text-[#8899a6] text-sm">
          <div className="animate-spin rounded-full h-4 w-4 border border-[#1d9bf0] border-t-transparent"></div>
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
    <div className="bg-[#192734] rounded-lg p-4 mt-4">
      <h3 className="text-sm font-semibold text-[#8899a6] mb-3">
        Nearby Airports (within 30nm)
      </h3>
      <div className="grid gap-2">
        {displayedAirports.map((airport) => (
          <button
            key={airport.icao}
            onClick={() => onSelect(airport.icao)}
            className="flex items-center justify-between w-full text-left p-2 rounded hover:bg-[#22303c] transition-colors group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="font-mono text-[#1d9bf0] font-semibold text-sm">
                {airport.icao}
              </span>
              <span className="text-white text-sm truncate">
                {airport.name}
              </span>
              <span className="text-[#8899a6] text-xs hidden sm:inline">
                {airport.city}, {airport.state}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[#8899a6] text-sm tabular-nums">
                {airport.distance}nm
              </span>
              <svg
                className="w-4 h-4 text-[#8899a6] group-hover:text-[#1d9bf0] transition-colors"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </div>
          </button>
        ))}
      </div>
      {nearby.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[#1d9bf0] text-sm hover:underline w-full text-center"
        >
          {expanded ? 'Show less' : `Show ${nearby.length - 5} more`}
        </button>
      )}
    </div>
  );
}

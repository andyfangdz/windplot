'use client';

import { AIRPORT_LIST } from '@/lib/airports';

interface AirportSelectorProps {
  selectedIcao: string;
  onSelect: (icao: string) => void;
  hours: number;
  onHoursChange: (hours: number) => void;
}

export default function AirportSelector({
  selectedIcao,
  onSelect,
  hours,
  onHoursChange,
}: AirportSelectorProps) {
  return (
    <div className="flex flex-wrap gap-2 justify-center mb-4">
      <div className="flex gap-1 flex-wrap justify-center">
        {AIRPORT_LIST.map((airport) => (
          <button
            key={airport.icao}
            onClick={() => onSelect(airport.icao)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              selectedIcao === airport.icao
                ? 'bg-[#1d9bf0] text-white'
                : 'bg-[#192734] text-[#8899a6] hover:bg-[#22303c] hover:text-white'
            }`}
          >
            {airport.icao}
          </button>
        ))}
      </div>
      <select
        value={hours}
        onChange={(e) => onHoursChange(parseInt(e.target.value, 10))}
        className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#192734] text-[#8899a6] border-none outline-none cursor-pointer hover:bg-[#22303c]"
      >
        <option value={1}>1h</option>
        <option value={2}>2h</option>
        <option value={4}>4h</option>
        <option value={6}>6h</option>
        <option value={12}>12h</option>
        <option value={24}>24h</option>
      </select>
    </div>
  );
}

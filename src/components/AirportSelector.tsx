'use client';

import { useState, useRef, useEffect, useCallback, useTransition } from 'react';
import { searchAirports, AirportSearchResult, Airport } from '@/app/actions';

interface AirportSelectorProps {
  selectedIcao: string;
  selectedAirport: Airport | null;
  favorites: AirportSearchResult[];
  onSelect: (icao: string) => void;
  hours: number;
  onHoursChange: (hours: number) => void;
  viewMode: 'observations' | 'forecast';
  forecastRange: 24 | 72;
  forecastHoursLimit: number;
  onForecastHoursLimitChange: (hours: number) => void;
}

const OBS_HOUR_OPTIONS = [1, 2, 4, 6, 12, 24];
const FORECAST_24_OPTIONS = [
  { value: 4, label: '4h' },
  { value: 8, label: '8h' },
  { value: 12, label: '12h' },
  { value: 24, label: '24h' },
];
const FORECAST_72_OPTIONS = [
  { value: 12, label: '12h' },
  { value: 24, label: '1d' },
  { value: 48, label: '2d' },
  { value: 72, label: '3d' },
];

export default function AirportSelector({
  selectedIcao,
  selectedAirport,
  favorites,
  onSelect,
  hours,
  onHoursChange,
  viewMode,
  forecastRange,
  forecastHoursLimit,
  onForecastHoursLimitChange,
}: AirportSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AirportSearchResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle search with server action
  useEffect(() => {
    if (searchQuery.length >= 2) {
      startTransition(async () => {
        const results = await searchAirports(searchQuery, 10);
        setSearchResults(results);
        setShowDropdown(results.length > 0);
        setHighlightedIndex(0);
      });
    }
  }, [searchQuery]);

  // Reset search results when query becomes too short
  useEffect(() => {
    if (searchQuery.length < 2) {
      startTransition(() => {
        setSearchResults([]);
        setShowDropdown(false);
      });
    }
  }, [searchQuery]);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current &&
        !inputRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectAirport = useCallback(
    (icao: string) => {
      onSelect(icao);
      setSearchQuery('');
      setShowDropdown(false);
      inputRef.current?.blur();
    },
    [onSelect]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightedIndex((i) =>
          i < searchResults.length - 1 ? i + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((i) =>
          i > 0 ? i - 1 : searchResults.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (searchResults[highlightedIndex]) {
          handleSelectAirport(searchResults[highlightedIndex].icao);
        }
        break;
      case 'Escape':
        setShowDropdown(false);
        inputRef.current?.blur();
        break;
    }
  };

  const isSelectedFavorite = favorites.some((f) => f.icao === selectedIcao);

  return (
    <div className="mb-4">
      {/* Favorites row */}
      <div className="flex flex-wrap gap-2 justify-center mb-3">
        <div className="flex gap-1 flex-wrap justify-center">
          {favorites.map((airport) => (
            <button
              key={airport.icao}
              onClick={() => handleSelectAirport(airport.icao)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                selectedIcao === airport.icao
                  ? 'bg-[#1d9bf0] text-white'
                  : 'bg-[#192734] text-[#8899a6] hover:bg-[#22303c] hover:text-white'
              }`}
              title={airport.name}
            >
              {airport.icao}
            </button>
          ))}
        </div>

        {/* Hours / forecast limit selector */}
        {viewMode === 'observations' ? (
          <select
            value={hours}
            onChange={(e) => onHoursChange(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#192734] text-[#8899a6] border-none outline-none cursor-pointer hover:bg-[#22303c]"
          >
            {OBS_HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>{h}h</option>
            ))}
          </select>
        ) : (
          <select
            value={forecastHoursLimit}
            onChange={(e) => onForecastHoursLimitChange(parseInt(e.target.value, 10))}
            className="px-3 py-1.5 rounded-lg text-sm font-medium bg-[#192734] text-[#10b981] border-none outline-none cursor-pointer hover:bg-[#22303c]"
          >
            {(forecastRange === 72 ? FORECAST_72_OPTIONS : FORECAST_24_OPTIONS).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Search row */}
      <div className="relative max-w-xs mx-auto">
        <div className="relative">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              if (searchQuery.length >= 2 && searchResults.length > 0) {
                setShowDropdown(true);
              }
            }}
            placeholder="Search airports (ICAO or name)..."
            className="w-full px-4 py-2 rounded-lg bg-[#192734] text-white placeholder-[#8899a6] border border-[#38444d] focus:border-[#1d9bf0] focus:outline-none text-sm"
          />
          {isPending ? (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#1d9bf0] border-t-transparent rounded-full animate-spin" />
          ) : (
            <svg
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#8899a6]"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          )}
        </div>

        {/* Search dropdown */}
        {showDropdown && (
          <div
            ref={dropdownRef}
            className="absolute z-50 w-full mt-1 bg-[#192734] border border-[#38444d] rounded-lg shadow-lg max-h-64 overflow-y-auto"
          >
            {searchResults.map((airport, index) => (
              <button
                key={airport.icao}
                onClick={() => handleSelectAirport(airport.icao)}
                className={`w-full px-4 py-2 text-left text-sm transition-colors ${
                  index === highlightedIndex
                    ? 'bg-[#22303c] text-white'
                    : 'text-[#8899a6] hover:bg-[#22303c] hover:text-white'
                } ${index === 0 ? 'rounded-t-lg' : ''} ${
                  index === searchResults.length - 1 ? 'rounded-b-lg' : ''
                }`}
              >
                <span className="font-mono font-bold text-[#1d9bf0]">
                  {airport.icao}
                </span>
                <span className="ml-2">{airport.name}</span>
                <span className="ml-1 text-xs text-[#657786]">
                  ({airport.city}, {airport.state})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Currently selected (if not a favorite) */}
      {!isSelectedFavorite && selectedAirport && (
        <div className="text-center mt-2 text-xs text-[#8899a6]">
          Selected:{' '}
          <span className="font-mono text-[#1d9bf0]">{selectedAirport.icao}</span>{' '}
          - {selectedAirport.name}
        </div>
      )}
    </div>
  );
}

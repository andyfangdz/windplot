import airportsData from './airports-data.json';

export interface Runway {
  id: string;
  low: string;
  high: string;
  trueHdg: number;
  length: number;
  width: number;
  surface: string;
}

export interface Airport {
  icao: string;
  faaId: string;
  name: string;
  city: string;
  state: string;
  lat: number;
  lon: number;
  runways: Runway[];
}

// Favorite airports (quick-select buttons)
export const FAVORITE_ICAOS = ['KCDW', 'KFRG', 'KTEB', 'KMMU', 'KEWR'];

// All airports from NASR data
export const AIRPORTS: Airport[] = airportsData.airports as Airport[];

// Map for quick lookup by ICAO
export const AIRPORTS_BY_ICAO: Map<string, Airport> = new Map(
  AIRPORTS.map((a) => [a.icao, a])
);

// Get airport by ICAO code
export function getAirport(icao: string): Airport | undefined {
  return AIRPORTS_BY_ICAO.get(icao.toUpperCase());
}

// Get favorite airports
export function getFavoriteAirports(): Airport[] {
  return FAVORITE_ICAOS.map((icao) => getAirport(icao)).filter(
    (a): a is Airport => a !== undefined
  );
}

// Search airports by ICAO or name (case-insensitive)
export function searchAirports(query: string, limit = 20): Airport[] {
  if (!query || query.length < 2) return [];

  const q = query.toUpperCase();
  const results: Airport[] = [];

  // First pass: exact ICAO match
  const exactMatch = AIRPORTS_BY_ICAO.get(q);
  if (exactMatch) {
    results.push(exactMatch);
  }

  // Second pass: ICAO starts with query
  for (const airport of AIRPORTS) {
    if (results.length >= limit) break;
    if (airport.icao.startsWith(q) && !results.includes(airport)) {
      results.push(airport);
    }
  }

  // Third pass: name/city contains query
  const lowerQ = query.toLowerCase();
  for (const airport of AIRPORTS) {
    if (results.length >= limit) break;
    if (
      !results.includes(airport) &&
      (airport.name.toLowerCase().includes(lowerQ) ||
        airport.city.toLowerCase().includes(lowerQ))
    ) {
      results.push(airport);
    }
  }

  return results;
}

// Data metadata
export const AIRPORTS_METADATA = {
  generated: airportsData.generated,
  count: airportsData.count,
};

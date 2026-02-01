'use server';

import airportsData from '@/lib/airports-data.json';

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

export interface AirportSearchResult {
  icao: string;
  name: string;
  city: string;
  state: string;
}

// Favorite airports (quick-select buttons)
const FAVORITE_ICAOS = ['KCDW', 'KFRG', 'KTEB', 'KMMU', 'KEWR'];

// Load airports into memory on server
const airports: Airport[] = airportsData.airports as Airport[];
const airportsByIcao: Map<string, Airport> = new Map(
  airports.map((a) => [a.icao, a])
);
// Also index by FAA ID for searching
const airportsByFaaId: Map<string, Airport> = new Map(
  airports.filter((a) => a.faaId).map((a) => [a.faaId, a])
);

// Get airport by ICAO code or FAA ID (returns full data including runways)
export async function getAirport(id: string): Promise<Airport | null> {
  const upper = id.toUpperCase();
  // Try ICAO first
  const byIcao = airportsByIcao.get(upper);
  if (byIcao) return byIcao;
  // Try FAA ID (e.g., "N38" -> lookup in faaId map)
  const byFaa = airportsByFaaId.get(upper);
  if (byFaa) return byFaa;
  // Try with K prefix (e.g., "N38" -> "KN38")
  const withK = airportsByIcao.get(`K${upper}`);
  if (withK) return withK;
  return null;
}

// Get favorite airports (minimal data for quick-select buttons)
export async function getFavoriteAirports(): Promise<AirportSearchResult[]> {
  return FAVORITE_ICAOS.map((icao) => {
    const airport = airportsByIcao.get(icao);
    if (!airport) return null;
    return {
      icao: airport.icao,
      name: airport.name,
      city: airport.city,
      state: airport.state,
    };
  }).filter((a): a is AirportSearchResult => a !== null);
}

// Search airports by ICAO or name (returns minimal data)
export async function searchAirports(
  query: string,
  limit = 20
): Promise<AirportSearchResult[]> {
  if (!query || query.length < 2) return [];

  const q = query.toUpperCase();
  const results: AirportSearchResult[] = [];
  const seen = new Set<string>();

  const addResult = (airport: Airport) => {
    if (seen.has(airport.icao)) return;
    seen.add(airport.icao);
    results.push({
      icao: airport.icao,
      name: airport.name,
      city: airport.city,
      state: airport.state,
    });
  };

  // First pass: exact ICAO match
  const exactMatch = airportsByIcao.get(q);
  if (exactMatch) {
    addResult(exactMatch);
  }

  // Also check exact FAA ID match (e.g., "N38" -> "KN38")
  const faaMatch = airportsByFaaId.get(q);
  if (faaMatch && !seen.has(faaMatch.icao)) {
    addResult(faaMatch);
  }

  // Second pass: ICAO or FAA ID starts with query
  for (const airport of airports) {
    if (results.length >= limit) break;
    if (airport.icao.startsWith(q) || airport.faaId?.startsWith(q)) {
      addResult(airport);
    }
  }

  // Third pass: name/city contains query
  const lowerQ = query.toLowerCase();
  for (const airport of airports) {
    if (results.length >= limit) break;
    if (
      airport.name.toLowerCase().includes(lowerQ) ||
      airport.city.toLowerCase().includes(lowerQ)
    ) {
      addResult(airport);
    }
  }

  return results;
}

'use server';

import airportsData from '@/lib/airports-data.json';
import { WindData, WindDataPoint } from '@/lib/types';

// Synoptic API config
const SYNOPTIC_TOKEN = 'REDACTED_SYNOPTIC_TOKEN';
const SYNOPTIC_ORIGIN = 'https://www.weather.gov';

interface SynopticObservations {
  date_time: string[];
  wind_speed_set_1?: (number | null)[];
  wind_direction_set_1?: (number | null)[];
  wind_gust_set_1?: (number | null)[];
}

interface SynopticStation {
  STID: string;
  NAME: string;
  OBSERVATIONS: SynopticObservations;
}

interface SynopticResponse {
  SUMMARY: { RESPONSE_CODE: number; RESPONSE_MESSAGE: string };
  STATION?: SynopticStation[];
}

// Fetch wind data from Synoptic API
export async function getWindData(icao: string, hours: number): Promise<WindData | null> {
  const upperIcao = icao.toUpperCase();
  const minutes = Math.min(Math.max(1, hours), 720) * 60;
  const url = `https://api.synopticdata.com/v2/stations/timeseries?STID=${upperIcao}&showemptystations=1&units=temp|F,speed|kts,english&recent=${minutes}&complete=1&token=${SYNOPTIC_TOKEN}&obtimezone=local`;

  try {
    const response = await fetch(url, {
      headers: {
        'Origin': SYNOPTIC_ORIGIN,
        'User-Agent': 'WindPlot/1.0',
      },
      next: { revalidate: 60, tags: [`wind-${upperIcao}`] },
    });

    if (!response.ok) return null;

    const data: SynopticResponse = await response.json();
    if (data.SUMMARY?.RESPONSE_CODE !== 1 || !data.STATION?.length) return null;

    const station = data.STATION[0];
    const obs = station.OBSERVATIONS;
    if (!obs.date_time?.length) return null;

    const observations: WindDataPoint[] = obs.date_time.map((dt, i) => ({
      time: dt.split('T')[1]?.split(/[-+]/)[0]?.substring(0, 5) || '',
      timestamp: new Date(dt).getTime() / 1000,
      wspd: obs.wind_speed_set_1?.[i] ?? null,
      wgst: obs.wind_gust_set_1?.[i] ?? null,
      wdir: obs.wind_direction_set_1?.[i] ?? null,
    }));

    const airport = await getAirport(upperIcao);
    return {
      icao: upperIcao,
      name: airport?.name || station.NAME || upperIcao,
      observations,
    };
  } catch (error) {
    console.error('Synoptic fetch error:', error);
    return null;
  }
}

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

// METAR data type
export interface MetarData {
  wdir: number | null;
  wspd: number | null;
  wgst: number | null;
  rawOb?: string;
  obsTime?: number;
}

// Fetch latest METAR for an airport
export async function getMetar(icao: string): Promise<MetarData | null> {
  const upperIcao = icao.toUpperCase();
  const url = `https://aviationweather.gov/api/data/metar?ids=${upperIcao}&format=json`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'WindPlot/1.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const latest = data[0];
    return {
      wdir: latest.wdir === 0 ? null : latest.wdir,
      wspd: latest.wspd,
      wgst: latest.wgst,
      rawOb: latest.rawOb,
      obsTime: latest.obsTime,
    };
  } catch (error) {
    console.error('METAR fetch error:', error);
    return null;
  }
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

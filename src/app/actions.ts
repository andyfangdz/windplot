'use server';

import * as fs from 'fs';
import * as path from 'path';
import airportsData from '@/lib/airports-data.json';
import { WindData, WindDataPoint, ForecastData, ForecastDataPoint } from '@/lib/types';
import { parseNbmBulletin, getNbmBulletinUrl, NbmProductType } from '@/lib/nbm-parser';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import KDBush from 'kdbush';
import * as geokdbush from 'geokdbush';
import tzlookup from '@photostructure/tz-lookup';

// Synoptic API config
function getSynopticConfig(): { token: string; origin: string } | null {
  const token = process.env.SYNOPTIC_API_TOKEN;
  const origin = process.env.SYNOPTIC_ORIGIN;

  if (!token || !origin) {
    console.error(
      'Missing Synoptic env vars: SYNOPTIC_API_TOKEN and SYNOPTIC_ORIGIN are required'
    );
    return null;
  }

  return { token, origin };
}

// Fetch configuration
const FETCH_TIMEOUT_MS = 5000;
const MAX_RETRIES = 3;

// Fetch with timeout and retry logic
async function fetchWithTimeoutAndRetry(
  url: string,
  options: RequestInit = {},
  retries: number = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on abort (timeout) for the last attempt
      if (attempt < retries - 1) {
        // Exponential backoff: 500ms, 1000ms, 2000ms
        await new Promise((resolve) => setTimeout(resolve, 500 * Math.pow(2, attempt)));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}

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
export async function getWindData(
  icao: string,
  hours: number,
  forceRefresh: boolean = false
): Promise<WindData | null> {
  const upperIcao = icao.toUpperCase();
  const minutes = Math.min(Math.max(1, hours), 720) * 60;
  const synopticConfig = getSynopticConfig();
  if (!synopticConfig) return null;

  const params = new URLSearchParams({
    STID: upperIcao,
    showemptystations: '1',
    units: 'temp|F,speed|kts,english',
    recent: String(minutes),
    complete: '1',
    token: synopticConfig.token,
    obtimezone: 'local',
  });
  const url = `https://api.synopticdata.com/v2/stations/timeseries?${params.toString()}`;

  try {
    const response = await fetchWithTimeoutAndRetry(url, {
      headers: {
        'Origin': synopticConfig.origin,
        'User-Agent': 'WindPlot/1.0',
      },
      // Bypass cache when forceRefresh is true (for manual/auto refresh)
      ...(forceRefresh
        ? { cache: 'no-store' as const }
        : { next: { revalidate: 60, tags: [`wind-${upperIcao}`] } }),
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
  lowLda: number;
  highLda: number;
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

// Filter airports with valid coordinates (must match order used when building index)
const airportsWithCoords = airports.filter(
  (a) => a.lat !== undefined && a.lon !== undefined
);

// Load pre-built spatial index from binary file (built by update-nasr script)
const spatialIndexPath = path.join(process.cwd(), 'src', 'lib', 'spatial-index.bin');
const indexBuffer = fs.readFileSync(spatialIndexPath);
// Convert Node Buffer to ArrayBuffer for KDBush.from()
// Using Uint8Array.from() creates a proper ArrayBuffer that KDBush accepts
const uint8Array = new Uint8Array(indexBuffer);
const spatialIndex = KDBush.from(uint8Array.buffer);

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
    const response = await fetchWithTimeoutAndRetry(url, {
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
      // wdir=0 + wspd=0 means calm; wdir=0 + wspd>0 means variable (VRB), null out direction
      wdir: (latest.wdir === 0 && (latest.wspd ?? 0) > 0) ? null : (latest.wdir ?? null),
      wspd: latest.wspd ?? null,
      wgst: latest.wgst ?? null,
      rawOb: latest.rawOb,
      obsTime: latest.obsTime,
    };
  } catch (error) {
    console.error('METAR fetch error:', error);
    return null;
  }
}

// Batch fetch latest METARs for multiple airports
// Returns a map of ICAO -> MetarData
export async function getMetarBatch(icaos: string[]): Promise<Record<string, MetarData>> {
  if (icaos.length === 0) return {};
  const ids = icaos.map((s) => s.toUpperCase()).join(',');
  const url = `https://aviationweather.gov/api/data/metar?ids=${ids}&format=json`;

  try {
    const response = await fetchWithTimeoutAndRetry(url, {
      headers: {
        'User-Agent': 'WindPlot/1.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) return {};

    const data = await response.json();
    if (!Array.isArray(data)) return {};

    const result: Record<string, MetarData> = {};
    for (const entry of data) {
      const stationId = (entry.icaoId ?? entry.stationId ?? '').toUpperCase();
      if (!stationId) continue;
      result[stationId] = {
        wdir: (entry.wdir === 0 && (entry.wspd ?? 0) > 0) ? null : (entry.wdir ?? null),
        wspd: entry.wspd ?? null,
        wgst: entry.wgst ?? null,
        rawOb: entry.rawOb,
        obsTime: entry.obsTime,
      };
    }
    return result;
  } catch (error) {
    console.error('Batch METAR fetch error:', error);
    return {};
  }
}

// Fetch NBM text bulletin from NOMADS
// productType: 'nbh' for hourly (24h) or 'nbs' for 3-hourly (72h)
async function fetchNbmBulletin(productType: NbmProductType = 'nbh'): Promise<string | null> {
  const url = getNbmBulletinUrl(productType);
  const productFile = productType === 'nbh' ? 'blend_nbhtx' : 'blend_nbstx';

  try {
    const response = await fetchWithTimeoutAndRetry(url, {
      headers: {
        'User-Agent': 'WindPlot/1.0 (aviation weather visualization)',
      },
      next: { revalidate: 900 }, // Cache for 15 minutes
    });

    if (!response.ok) {
      // Try previous hour (2 hours ago) if current hour not available yet,
      // adjusting both hour and date in UTC.
      const now = new Date();
      const fallbackDate = new Date(now.getTime() - 2 * 60 * 60 * 1000);
      const prevHour = fallbackDate.getUTCHours();
      const prevHourStr = prevHour.toString().padStart(2, '0');
      const year = fallbackDate.getUTCFullYear();
      const month = (fallbackDate.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = fallbackDate.getUTCDate().toString().padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      const fallbackUrl = `https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.${dateStr}/${prevHourStr}/text/${productFile}.t${prevHourStr}z`;

      const fallbackResponse = await fetchWithTimeoutAndRetry(fallbackUrl, {
        headers: {
          'User-Agent': 'WindPlot/1.0 (aviation weather visualization)',
        },
        next: { revalidate: 900 },
      });

      if (!fallbackResponse.ok) {
        console.error('NBM bulletin fetch error:', fallbackResponse.status);
        return null;
      }

      return await fallbackResponse.text();
    }

    return await response.text();
  } catch (error) {
    console.error('NBM bulletin fetch error:', error);
    return null;
  }
}

// Fetch NBM forecast from NOAA NBM text bulletins
// forecastRange: 24 for hourly NBH product, 72 for 3-hourly NBS product
export async function getNbmForecast(
  icao: string,
  forecastRange: 24 | 72 = 24
): Promise<ForecastData | null> {
  const upperIcao = icao.toUpperCase();
  const productType: NbmProductType = forecastRange === 72 ? 'nbs' : 'nbh';

  // Get airport info for name and coordinates
  const airport = await getAirport(upperIcao);
  if (!airport) {
    console.error('Airport not found:', upperIcao);
    return null;
  }

  // Get airport's timezone from lat/lon
  const timezone = tzlookup(airport.lat, airport.lon) || 'UTC';

  try {
    const bulletinText = await fetchNbmBulletin(productType);
    if (!bulletinText) {
      console.error('Failed to fetch NBM bulletin');
      return null;
    }

    const nbmData = parseNbmBulletin(bulletinText, upperIcao, productType);
    if (!nbmData || nbmData.times.length === 0) {
      console.error('Station not found in NBM bulletin:', upperIcao);
      return null;
    }

    // Convert parsed NBM data to ForecastData format
    const forecasts: ForecastDataPoint[] = [];
    const now = Date.now();

    for (let i = 0; i < nbmData.times.length; i++) {
      const forecastTime = nbmData.times[i];
      // Skip forecasts in the past
      if (forecastTime.getTime() < now - 30 * 60 * 1000) continue;

      // For 72h forecasts, include day info since it spans multiple days
      // Use airport's local timezone for display
      const timeFormat = forecastRange === 72
        ? forecastTime.toLocaleDateString('en-US', {
            weekday: 'short',
            hour: 'numeric',
            hour12: true,
            timeZone: timezone,
          })
        : forecastTime.toLocaleTimeString('en-US', {
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
            timeZone: timezone,
          });

      forecasts.push({
        time: timeFormat,
        timestamp: Math.floor(forecastTime.getTime() / 1000),
        wspd: nbmData.wsp[i] ?? null,
        wgst: nbmData.gst[i] ?? null,
        wdir: nbmData.wdr[i] ?? null,
        temp: nbmData.tmp[i] ?? null,
        sky: nbmData.sky[i] ?? null,
        pop: nbmData.pop[i] ?? null,
      });
    }

    if (forecasts.length === 0) {
      return null;
    }

    return {
      icao: upperIcao,
      name: airport.name,
      forecasts,
      generatedAt: Math.floor(nbmData.times[0].getTime() / 1000),
    };
  } catch (error) {
    console.error('NBM forecast fetch error:', error);
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

// Combined airport data type (wind + METAR in one call)
export interface AirportFullData {
  icao: string;
  airport: Airport | null;
  windData: WindData | null;
  metar: MetarData | null;
}

// Fetch all data for an airport in parallel (wind + METAR)
export async function getAirportFullData(
  icao: string,
  hours: number,
  forceRefresh: boolean = false
): Promise<AirportFullData> {
  const upperIcao = icao.toUpperCase();
  const [airport, windData, metar] = await Promise.all([
    getAirport(upperIcao),
    getWindData(upperIcao, hours, forceRefresh),
    getMetar(upperIcao),
  ]);

  return {
    icao: upperIcao,
    airport,
    windData,
    metar,
  };
}

// Prefetch data for favorite airports (returns map of icao -> data)
export async function prefetchFavorites(
  hours: number,
  limit: number = 3
): Promise<Record<string, AirportFullData>> {
  const icaos = FAVORITE_ICAOS.slice(0, limit);
  const results = await Promise.all(
    icaos.map((icao) => getAirportFullData(icao, hours))
  );

  return Object.fromEntries(results.map((data) => [data.icao, data]));
}

// Nearby airport result with distance
export interface NearbyAirport {
  icao: string;
  name: string;
  city: string;
  state: string;
  distance: number; // in nautical miles
}

// Convert kilometers to nautical miles
const KM_TO_NM = 0.539957;

// Get nearby airports within a radius using spatial index (default 30nm)
// Uses k-d tree for O(log n) spatial queries and WGS84 ellipsoid for accurate distances
export async function getNearbyAirports(
  icao: string,
  radiusNm: number = 30,
  limit: number = 10
): Promise<NearbyAirport[]> {
  const upperIcao = icao.toUpperCase();
  const sourceAirport = airportsByIcao.get(upperIcao);

  if (!sourceAirport || sourceAirport.lat === undefined || sourceAirport.lon === undefined) {
    return [];
  }

  const { lat: sourceLat, lon: sourceLon } = sourceAirport;
  const sourcePoint = point([sourceLon, sourceLat]);

  // Convert radius to km for geokdbush (it uses km internally)
  const radiusKm = radiusNm / KM_TO_NM;

  // Use spatial index to efficiently find nearby airports
  // geokdbush.around returns indices sorted by distance
  // We request more than limit to account for filtering out the source airport
  const candidateIndices = geokdbush.around(
    spatialIndex,
    sourceLon,
    sourceLat,
    limit + 1,
    radiusKm
  );

  const nearby: NearbyAirport[] = [];

  for (const idx of candidateIndices) {
    const airport = airportsWithCoords[idx];

    // Skip the source airport
    if (airport.icao === upperIcao) continue;

    // Calculate accurate WGS84 distance using turf
    const destPoint = point([airport.lon, airport.lat]);
    const distanceKm = distance(sourcePoint, destPoint, { units: 'kilometers' });
    const distanceNm = distanceKm * KM_TO_NM;

    // Double-check distance (geokdbush uses approximate great-circle, turf uses WGS84)
    if (distanceNm <= radiusNm) {
      nearby.push({
        icao: airport.icao,
        name: airport.name,
        city: airport.city,
        state: airport.state,
        distance: Math.round(distanceNm * 10) / 10,
      });
    }

    if (nearby.length >= limit) break;
  }

  return nearby;
}

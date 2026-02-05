'use server';

import * as fs from 'fs';
import * as path from 'path';
import airportsData from '@/lib/airports-data.json';
import { WindData, WindDataPoint, ForecastData, ForecastDataPoint } from '@/lib/types';
import distance from '@turf/distance';
import { point } from '@turf/helpers';
import KDBush from 'kdbush';
import * as geokdbush from 'geokdbush';

// Synoptic API config
const SYNOPTIC_TOKEN = 'REDACTED_SYNOPTIC_TOKEN';
const SYNOPTIC_ORIGIN = 'https://www.weather.gov';

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
  const url = `https://api.synopticdata.com/v2/stations/timeseries?STID=${upperIcao}&showemptystations=1&units=temp|F,speed|kts,english&recent=${minutes}&complete=1&token=${SYNOPTIC_TOKEN}&obtimezone=local`;

  try {
    const response = await fetchWithTimeoutAndRetry(url, {
      headers: {
        'Origin': SYNOPTIC_ORIGIN,
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
      wdir: latest.wdir === 0 ? null : (latest.wdir ?? null),
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

// Weather.gov API types for NBM-derived forecasts
interface WeatherGovGridpointsResponse {
  properties: {
    updateTime?: string;
    validTimes?: string;
    windSpeed?: {
      uom: string;
      values: Array<{ validTime: string; value: number }>;
    };
    windGust?: {
      uom: string;
      values: Array<{ validTime: string; value: number }>;
    };
    windDirection?: {
      uom: string;
      values: Array<{ validTime: string; value: number }>;
    };
    temperature?: {
      uom: string;
      values: Array<{ validTime: string; value: number }>;
    };
    skyCover?: {
      uom: string;
      values: Array<{ validTime: string; value: number }>;
    };
    probabilityOfPrecipitation?: {
      uom: string;
      values: Array<{ validTime: string; value: number }>;
    };
  };
}

interface WeatherGovPointsResponse {
  properties: {
    gridId: string;
    gridX: number;
    gridY: number;
    forecastGridData: string;
  };
}

// NBM Text Bulletin Parser
// URL pattern: https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.{date}/{hour}/text/blend_nbhtx.t{hour}z

interface NbmParsedData {
  station: string;
  times: Date[];
  wdr: (number | null)[];  // Wind direction in degrees
  wsp: (number | null)[];  // Wind speed in knots
  gst: (number | null)[];  // Wind gust in knots
  tmp: (number | null)[];  // Temperature in F
  dpt: (number | null)[];  // Dew point in F
  sky: (number | null)[];  // Sky cover %
  cig: (number | null)[];  // Ceiling in feet (null = unlimited)
  vis: (number | null)[];  // Visibility in miles
  pop: (number | null)[];  // Probability of precipitation %
}

// Parse NBM text bulletin for a specific station
function parseNbmBulletin(text: string, station: string): NbmParsedData | null {
  // Find station section - format: "KFRG   NBH" at start of line
  const stationPattern = new RegExp(`^${station}\\s+NBH`, 'm');
  const stationMatch = text.match(stationPattern);
  if (!stationMatch || stationMatch.index === undefined) {
    return null;
  }

  // Find end of station section (next station or end of file)
  const startIdx = stationMatch.index;
  const endPattern = /\n[A-Z]{4}\s+NBH/;
  const endMatch = text.slice(startIdx + 10).match(endPattern);
  const endIdx = endMatch?.index ? startIdx + 10 + endMatch.index : text.length;

  const stationSection = text.slice(startIdx, endIdx);
  const lines = stationSection.split('\n').filter(l => l.trim());

  if (lines.length < 3) return null;

  // Parse header line: "KFRG   NBH GFS MOS GUIDANCE   2/05/2026  0700 UTC"
  const headerLine = lines[0];
  const dateMatch = headerLine.match(/(\d{1,2})\/(\d{2})\/(\d{4})\s+(\d{2})(\d{2})\s*UTC/);
  if (!dateMatch) return null;

  const [, month, day, year, hour, minute] = dateMatch;
  const baseTime = new Date(Date.UTC(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute)
  ));

  // Parse time row - find line starting with UTC or containing hour values
  // Format: "UTC  08 09 10 11 12 13 14 15 16 17 18 19 20 21 22 23 00 01 02 03 04 05 06 07 08"
  let forecastHours: number[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('UTC') || line.startsWith('FHR')) {
      // Extract hours from the line
      const hourMatches = line.match(/\d{2}/g);
      if (hourMatches) {
        forecastHours = hourMatches.map(h => parseInt(h));
      }
      break;
    }
  }

  if (forecastHours.length === 0) return null;

  // Generate timestamps for each forecast hour
  const times: Date[] = [];
  let currentDate = new Date(baseTime);
  let prevHour = baseTime.getUTCHours();

  for (const hour of forecastHours) {
    // Handle day rollover
    if (hour < prevHour) {
      currentDate = new Date(currentDate.getTime() + 24 * 60 * 60 * 1000);
    }
    const forecastTime = new Date(Date.UTC(
      currentDate.getUTCFullYear(),
      currentDate.getUTCMonth(),
      currentDate.getUTCDate(),
      hour,
      0
    ));
    times.push(forecastTime);
    prevHour = hour;
  }

  // Helper to parse a data row
  const parseRow = (prefix: string): (number | null)[] => {
    for (const line of lines) {
      if (line.startsWith(prefix) || line.startsWith(` ${prefix}`)) {
        const values = line.slice(4).trim().split(/\s+/);
        return values.map(v => {
          const num = parseInt(v);
          if (isNaN(num) || num === -99 || v === 'NG') return null;
          return num;
        });
      }
    }
    return [];
  };

  // Parse all data rows
  const wdrRaw = parseRow('WDR');
  const wsp = parseRow('WSP');
  const gst = parseRow('GST');
  const tmp = parseRow('TMP');
  const dpt = parseRow('DPT');
  const sky = parseRow('SKY');
  const cigRaw = parseRow('CIG');
  const visRaw = parseRow('VIS');
  const pop = parseRow('P01'); // 1-hour precip probability

  // Convert wind direction from tens of degrees to degrees
  const wdr = wdrRaw.map(v => v !== null ? v * 10 : null);

  // Convert ceiling from hundreds of feet to feet, 888 = unlimited
  const cig = cigRaw.map(v => {
    if (v === null) return null;
    if (v === 888 || v === -88) return null; // Unlimited ceiling
    return v * 100;
  });

  // Convert visibility from tenths of miles to miles
  const vis = visRaw.map(v => v !== null ? v / 10 : null);

  return {
    station,
    times,
    wdr,
    wsp,
    gst,
    tmp,
    dpt,
    sky,
    cig,
    vis,
    pop,
  };
}

// Get current NBM bulletin URL
function getNbmBulletinUrl(): string {
  const now = new Date();
  // NBM is updated hourly, use the previous hour to ensure data is available
  const hour = (now.getUTCHours() - 1 + 24) % 24;
  const hourStr = hour.toString().padStart(2, '0');

  // Format date as YYYYMMDD
  const year = now.getUTCFullYear();
  const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
  const day = now.getUTCDate().toString().padStart(2, '0');
  const dateStr = `${year}${month}${day}`;

  return `https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.${dateStr}/${hourStr}/text/blend_nbhtx.t${hourStr}z`;
}

// Fetch NBM text bulletin from NOMADS
async function fetchNbmBulletin(): Promise<string | null> {
  const url = getNbmBulletinUrl();

  try {
    const response = await fetchWithTimeoutAndRetry(url, {
      headers: {
        'User-Agent': 'WindPlot/1.0 (aviation weather visualization)',
      },
      next: { revalidate: 900 }, // Cache for 15 minutes
    });

    if (!response.ok) {
      // Try previous hour if current hour not available yet
      const now = new Date();
      const prevHour = (now.getUTCHours() - 2 + 24) % 24;
      const prevHourStr = prevHour.toString().padStart(2, '0');
      const year = now.getUTCFullYear();
      const month = (now.getUTCMonth() + 1).toString().padStart(2, '0');
      const day = now.getUTCDate().toString().padStart(2, '0');
      const dateStr = `${year}${month}${day}`;
      const fallbackUrl = `https://nomads.ncep.noaa.gov/pub/data/nccf/com/blend/prod/blend.${dateStr}/${prevHourStr}/text/blend_nbhtx.t${prevHourStr}z`;

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

// Convert m/s to knots
const MS_TO_KNOTS = 1.94384;

// Convert Celsius to Fahrenheit
const celsiusToFahrenheit = (c: number): number => (c * 9) / 5 + 32;

// Parse ISO 8601 duration (e.g., "PT1H" -> 1 hour in milliseconds)
function parseIsoDuration(duration: string): number {
  const match = duration.match(/PT(\d+)H/);
  if (match) {
    return parseInt(match[1]) * 60 * 60 * 1000;
  }
  return 60 * 60 * 1000; // Default to 1 hour
}

// Expand weather.gov time series data to hourly values
function expandTimeSeries(
  values: Array<{ validTime: string; value: number }>,
  startTime: number,
  endTime: number,
  convertFn?: (v: number) => number
): Map<number, number> {
  const result = new Map<number, number>();

  for (const entry of values) {
    const [timeStr, durationStr] = entry.validTime.split('/');
    const entryStart = new Date(timeStr).getTime();
    const duration = durationStr ? parseIsoDuration(durationStr) : 60 * 60 * 1000;
    const entryEnd = entryStart + duration;

    // Expand this entry into hourly slots
    let current = entryStart;
    while (current < entryEnd && current < endTime) {
      if (current >= startTime) {
        // Round to hour
        const hourTimestamp = Math.floor(current / (60 * 60 * 1000)) * 60 * 60 * 1000;
        const value = convertFn ? convertFn(entry.value) : entry.value;
        result.set(hourTimestamp / 1000, value); // Store as Unix seconds
      }
      current += 60 * 60 * 1000; // Move to next hour
    }
  }

  return result;
}

// Fetch NBM forecast - tries real NBM text bulletin first, falls back to weather.gov gridpoints
export async function getNbmForecast(
  icao: string,
  hours: number = 24
): Promise<ForecastData | null> {
  const upperIcao = icao.toUpperCase();

  // First, get airport info
  const airport = await getAirport(upperIcao);
  if (!airport) {
    console.error('Airport not found:', upperIcao);
    return null;
  }

  // Try real NBM text bulletin first
  try {
    const bulletinText = await fetchNbmBulletin();
    if (bulletinText) {
      const nbmData = parseNbmBulletin(bulletinText, upperIcao);
      if (nbmData && nbmData.times.length > 0) {
        // Convert parsed NBM data to ForecastData format
        const forecasts: ForecastDataPoint[] = [];
        const now = Date.now();

        for (let i = 0; i < Math.min(nbmData.times.length, hours); i++) {
          const forecastTime = nbmData.times[i];
          // Skip forecasts in the past
          if (forecastTime.getTime() < now - 30 * 60 * 1000) continue;

          forecasts.push({
            time: forecastTime.toLocaleTimeString('en-US', {
              hour: 'numeric',
              minute: '2-digit',
              hour12: true,
            }),
            timestamp: Math.floor(forecastTime.getTime() / 1000),
            wspd: nbmData.wsp[i] ?? null,
            wgst: nbmData.gst[i] ?? null,
            wdir: nbmData.wdr[i] ?? null,
            temp: nbmData.tmp[i] ?? null,
            sky: nbmData.sky[i] ?? null,
            pop: nbmData.pop[i] ?? null,
          });
        }

        if (forecasts.length > 0) {
          return {
            icao: upperIcao,
            name: airport.name,
            forecasts,
            generatedAt: Math.floor(nbmData.times[0].getTime() / 1000),
          };
        }
      }
    }
  } catch (error) {
    console.error('NBM bulletin parse error, falling back to weather.gov:', error);
  }

  // Fallback to weather.gov gridpoints API (NDFD data)
  if (airport.lat === undefined || airport.lon === undefined) {
    console.error('Airport missing coordinates for fallback:', upperIcao);
    return null;
  }

  try {
    // Step 1: Get grid coordinates from lat/lon
    const pointsUrl = `https://api.weather.gov/points/${airport.lat.toFixed(4)},${airport.lon.toFixed(4)}`;
    const pointsResponse = await fetchWithTimeoutAndRetry(pointsUrl, {
      headers: {
        'User-Agent': 'WindPlot/1.0 (aviation weather visualization)',
        'Accept': 'application/geo+json',
      },
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!pointsResponse.ok) {
      console.error('Weather.gov points API error:', pointsResponse.status);
      return null;
    }

    const pointsData: WeatherGovPointsResponse = await pointsResponse.json();
    const { gridId, gridX, gridY } = pointsData.properties;

    // Step 2: Fetch gridpoint forecast data (raw numerical data)
    const gridUrl = `https://api.weather.gov/gridpoints/${gridId}/${gridX},${gridY}`;
    const gridResponse = await fetchWithTimeoutAndRetry(gridUrl, {
      headers: {
        'User-Agent': 'WindPlot/1.0 (aviation weather visualization)',
        'Accept': 'application/geo+json',
      },
      next: { revalidate: 900 }, // Cache for 15 minutes
    });

    if (!gridResponse.ok) {
      console.error('Weather.gov gridpoints API error:', gridResponse.status);
      return null;
    }

    const gridData: WeatherGovGridpointsResponse = await gridResponse.json();
    const props = gridData.properties;

    // Define time range
    const now = Date.now();
    const startTime = now;
    const endTime = now + hours * 60 * 60 * 1000;

    // Expand all time series to hourly values
    const windSpeeds = props.windSpeed?.values
      ? expandTimeSeries(props.windSpeed.values, startTime, endTime, (v) =>
          Math.round(v * MS_TO_KNOTS)
        )
      : new Map();

    const windGusts = props.windGust?.values
      ? expandTimeSeries(props.windGust.values, startTime, endTime, (v) =>
          Math.round(v * MS_TO_KNOTS)
        )
      : new Map();

    const windDirs = props.windDirection?.values
      ? expandTimeSeries(props.windDirection.values, startTime, endTime)
      : new Map();

    const temps = props.temperature?.values
      ? expandTimeSeries(props.temperature.values, startTime, endTime, celsiusToFahrenheit)
      : new Map();

    const skyCover = props.skyCover?.values
      ? expandTimeSeries(props.skyCover.values, startTime, endTime)
      : new Map();

    const pop = props.probabilityOfPrecipitation?.values
      ? expandTimeSeries(props.probabilityOfPrecipitation.values, startTime, endTime)
      : new Map();

    // Build hourly forecast points
    const forecasts: ForecastDataPoint[] = [];
    const timestamps = new Set([
      ...windSpeeds.keys(),
      ...windGusts.keys(),
      ...windDirs.keys(),
    ]);

    // Sort timestamps and create forecast points
    const sortedTimestamps = Array.from(timestamps).sort((a, b) => a - b);

    for (const ts of sortedTimestamps) {
      if (ts * 1000 < startTime || ts * 1000 > endTime) continue;

      const date = new Date(ts * 1000);
      forecasts.push({
        time: date.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
        timestamp: ts,
        wspd: windSpeeds.get(ts) ?? null,
        wgst: windGusts.get(ts) ?? null,
        wdir: windDirs.get(ts) ?? null,
        temp: temps.get(ts) ? Math.round(temps.get(ts)!) : null,
        sky: skyCover.get(ts) ?? null,
        pop: pop.get(ts) ?? null,
      });
    }

    // Limit to requested hours
    const limitedForecasts = forecasts.slice(0, hours);

    return {
      icao: upperIcao,
      name: airport.name,
      forecasts: limitedForecasts,
      generatedAt: props.updateTime ? new Date(props.updateTime).getTime() / 1000 : undefined,
    };
  } catch (error) {
    console.error('Weather.gov fallback fetch error:', error);
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

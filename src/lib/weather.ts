// Aviation weather utilities: cloud layers, visibility, flight categories,
// and the derived values (relative humidity, density altitude) that pilots
// read alongside wind.

import { CloudLayer } from './types';

export type FlightCategory = 'VFR' | 'MVFR' | 'IFR' | 'LIFR';

// ---------------------------------------------------------------------------
// Visibility
// ---------------------------------------------------------------------------

// Matches "1 1/2", "1/2" and friends
const FRACTION_RE = /^(\d+)?\s*(\d+)\/(\d+)$/;

// Parse a visibility value into statute miles.
// The Aviation Weather API returns either a number or strings like "10+",
// "1 1/2" or "M1/4" (less than a quarter mile).
export function parseVisibility(
  visib: string | number | null | undefined
): number | null {
  if (visib === null || visib === undefined) return null;
  if (typeof visib === 'number') return Number.isFinite(visib) ? visib : null;

  const raw = visib.trim();
  if (!raw) return null;

  // Drop trailing "+" ("10+" means 10 or more) and any "SM" unit suffix
  const withoutPlus = raw.endsWith('+') ? raw.slice(0, -1) : raw;
  const body = withoutPlus.replace(/\s*SM$/i, '').trim();

  // "M" prefix means "less than"; treat it as the stated value
  const core = /^M\d/i.test(body) ? body.slice(1).trim() : body;

  const fraction = core.match(FRACTION_RE);
  if (fraction) {
    const whole = fraction[1] ? parseInt(fraction[1], 10) : 0;
    const numerator = parseInt(fraction[2], 10);
    const denominator = parseInt(fraction[3], 10);
    if (!denominator) return null;
    return whole + numerator / denominator;
  }

  const value = parseFloat(core);
  return Number.isFinite(value) ? value : null;
}

// Render a value under 1 as an aviation-style fraction ("1/2", "3/4")
function formatEighths(value: number): string {
  const eighths = Math.round(value * 8);
  if (eighths <= 0) return '0';
  const whole = Math.floor(eighths / 8);
  const remainder = eighths % 8;
  if (remainder === 0) return String(whole);

  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(remainder, 8);
  const fraction = `${remainder / divisor}/${8 / divisor}`;
  return whole ? `${whole} ${fraction}` : fraction;
}

// Human-readable visibility, e.g. "10+ sm", "2.5 sm", "1/2 sm"
export function formatVisibility(
  visib: string | number | null | undefined
): string | null {
  const miles = parseVisibility(visib);
  if (miles === null) return null;

  const orMore = typeof visib === 'string' && visib.trim().endsWith('+') ? '+' : '';
  if (miles >= 1) {
    return `${Math.round(miles * 10) / 10}${orMore} sm`;
  }
  return `${formatEighths(miles)}${orMore} sm`;
}

// ---------------------------------------------------------------------------
// Cloud layers
// ---------------------------------------------------------------------------

export const CLOUD_COVER_LABELS: Record<string, string> = {
  SKC: 'Sky clear',
  CLR: 'Clear below 12,000',
  NCD: 'No clouds detected',
  NSC: 'No significant clouds',
  CAVOK: 'Ceiling and visibility OK',
  FEW: 'Few',
  SCT: 'Scattered',
  BKN: 'Broken',
  OVC: 'Overcast',
  OVX: 'Obscured',
  VV: 'Vertical visibility',
};

// Approximate sky coverage in oktas, used to shade the layer diagram
const CLOUD_COVER_OKTAS: Record<string, number> = {
  SKC: 0,
  CLR: 0,
  NCD: 0,
  NSC: 0,
  CAVOK: 0,
  FEW: 2,
  SCT: 4,
  BKN: 6,
  OVC: 8,
  OVX: 8,
  VV: 8,
};

// Covers that constitute a ceiling per FAA definition
const CEILING_COVERS = new Set(['BKN', 'OVC', 'OVX', 'VV']);

export function cloudCoverLabel(cover: string | null | undefined): string {
  if (!cover) return 'Unknown';
  return CLOUD_COVER_LABELS[cover.toUpperCase()] ?? cover.toUpperCase();
}

export function cloudCoverOktas(cover: string | null | undefined): number {
  if (!cover) return 0;
  return CLOUD_COVER_OKTAS[cover.toUpperCase()] ?? 0;
}

export function isCeilingLayer(cover: string | null | undefined): boolean {
  if (!cover) return false;
  return CEILING_COVERS.has(cover.toUpperCase());
}

// Format a layer the way it appears in a METAR, e.g. "BKN120"
export function formatCloudLayer(layer: CloudLayer): string {
  const cover = (layer.cover ?? '').toUpperCase();
  if (layer.base === null || layer.base === undefined) return cover;
  return `${cover}${String(Math.round(layer.base / 100)).padStart(3, '0')}`;
}

// Format a layer in prose, e.g. "Broken at 12,000 ft"
export function describeCloudLayer(layer: CloudLayer): string {
  const label = cloudCoverLabel(layer.cover);
  if (layer.base === null || layer.base === undefined) return label;
  return `${label} at ${layer.base.toLocaleString()} ft`;
}

// Lowest broken/overcast/obscured layer, in feet AGL. Null means no ceiling.
export function ceilingFromClouds(
  clouds: CloudLayer[] | null | undefined,
  vertVis?: number | null
): number | null {
  let ceiling: number | null = null;

  for (const layer of clouds ?? []) {
    if (!isCeilingLayer(layer.cover)) continue;
    if (layer.base === null || layer.base === undefined) continue;
    if (ceiling === null || layer.base < ceiling) ceiling = layer.base;
  }

  // An indefinite ceiling (vertical visibility) counts as the ceiling
  if (typeof vertVis === 'number' && (ceiling === null || vertVis < ceiling)) {
    ceiling = vertVis;
  }

  return ceiling;
}

// Lowest reported layer of any coverage, in feet AGL
export function lowestCloudBase(
  clouds: CloudLayer[] | null | undefined
): number | null {
  let lowest: number | null = null;
  for (const layer of clouds ?? []) {
    if (layer.base === null || layer.base === undefined) continue;
    if (lowest === null || layer.base < lowest) lowest = layer.base;
  }
  return lowest;
}

// Synoptic packs height and coverage into one number: every digit but the last
// is the height in hundreds of feet, and the last digit is the sky condition.
// https://docs.synopticdata.com/services/cloud-height-and-sky-condition
//
// Synoptic's scale has no FEW and adds "thin" variants inherited from legacy
// SAO coding. Thin layers are mapped to their base coverage, which can only
// over-state a restriction (thin broken still counts as a ceiling) — the safe
// direction for a flight-planning display.
const SYNOPTIC_SKY_CONDITIONS: Record<number, string | null> = {
  0: null, // missing
  1: 'CLR',
  2: 'SCT',
  3: 'BKN',
  4: 'OVC',
  5: 'OVX',
  6: 'SCT', // thin scattered
  7: 'BKN', // thin broken
  8: 'OVC', // thin overcast
  9: 'OVX', // thin obscured
};

export function decodeSynopticCloudLayer(
  code: number | null | undefined
): CloudLayer | null {
  if (code === null || code === undefined || !Number.isFinite(code)) return null;
  if (code < 0) return null;

  const rounded = Math.round(code);
  const cover = SYNOPTIC_SKY_CONDITIONS[rounded % 10];
  if (!cover) return null;

  const heightFt = Math.floor(rounded / 10) * 100;
  // A clear report carries no meaningful base
  if (cover === 'CLR') return { cover, base: null };
  return { cover, base: heightFt };
}

// Altimeter arrives as inHg, hPa or Pa depending on the station and the unit
// system in play. The three ranges do not overlap for any real sea-level
// pressure, so normalize by magnitude rather than trusting the request units.
export function normalizeAltimeterToInHg(
  value: number | null | undefined
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  if (value > 10000) return value / 3386.389;  // Pascals
  if (value > 100) return hpaToInHg(value);     // Hectopascals / millibars
  return value;                                 // Already inches of mercury
}

// Convert an NBM sky-cover percentage into a METAR-style coverage code
export function skyCoverCode(percent: number | null | undefined): string | null {
  if (percent === null || percent === undefined || !Number.isFinite(percent)) {
    return null;
  }
  if (percent < 6) return 'SKC';
  if (percent < 31) return 'FEW';
  if (percent < 56) return 'SCT';
  if (percent < 88) return 'BKN';
  return 'OVC';
}

// ---------------------------------------------------------------------------
// Flight categories
// ---------------------------------------------------------------------------

const CATEGORY_RANK: Record<FlightCategory, number> = {
  LIFR: 0,
  IFR: 1,
  MVFR: 2,
  VFR: 3,
};

export const FLIGHT_CATEGORY_STYLES: Record<
  FlightCategory,
  { color: string; description: string }
> = {
  VFR: { color: '#10b981', description: 'Ceiling > 3,000 ft and visibility > 5 sm' },
  MVFR: { color: '#1d9bf0', description: 'Ceiling 1,000–3,000 ft or visibility 3–5 sm' },
  IFR: { color: '#ef4444', description: 'Ceiling 500–999 ft or visibility 1–3 sm' },
  LIFR: { color: '#a855f7', description: 'Ceiling < 500 ft or visibility < 1 sm' },
};

function categoryFromCeiling(ceilingFt: number | null): FlightCategory | null {
  if (ceilingFt === null) return null;
  if (ceilingFt < 500) return 'LIFR';
  if (ceilingFt < 1000) return 'IFR';
  if (ceilingFt <= 3000) return 'MVFR';
  return 'VFR';
}

function categoryFromVisibility(visSm: number | null): FlightCategory | null {
  if (visSm === null) return null;
  if (visSm < 1) return 'LIFR';
  if (visSm < 3) return 'IFR';
  if (visSm <= 5) return 'MVFR';
  return 'VFR';
}

// The category is the more restrictive of the ceiling- and visibility-derived
// values. A null ceiling means "no ceiling", so visibility alone decides.
export function computeFlightCategory(
  ceilingFt: number | null,
  visSm: number | null
): FlightCategory | null {
  const byCeiling = categoryFromCeiling(ceilingFt);
  const byVis = categoryFromVisibility(visSm);

  if (byCeiling === null) return byVis;
  if (byVis === null) return byCeiling;
  return CATEGORY_RANK[byCeiling] <= CATEGORY_RANK[byVis] ? byCeiling : byVis;
}

// ---------------------------------------------------------------------------
// Present weather
// ---------------------------------------------------------------------------

const WX_DESCRIPTORS: Record<string, string> = {
  MI: 'shallow',
  PR: 'partial',
  BC: 'patchy',
  DR: 'low drifting',
  BL: 'blowing',
  SH: 'showers of',
  TS: 'thunderstorm',
  FZ: 'freezing',
};

const WX_PHENOMENA: Record<string, string> = {
  DZ: 'drizzle',
  RA: 'rain',
  SN: 'snow',
  SG: 'snow grains',
  IC: 'ice crystals',
  PL: 'ice pellets',
  GR: 'hail',
  GS: 'small hail',
  UP: 'unknown precipitation',
  BR: 'mist',
  FG: 'fog',
  FU: 'smoke',
  VA: 'volcanic ash',
  DU: 'widespread dust',
  SA: 'sand',
  HZ: 'haze',
  PY: 'spray',
  PO: 'dust whirls',
  SQ: 'squalls',
  FC: 'funnel cloud',
  SS: 'sandstorm',
  DS: 'duststorm',
};

function decodeWeatherToken(token: string): string | null {
  if (!token) return null;
  if (token === 'NSW') return 'No significant weather';

  let rest = token.toUpperCase();
  const parts: string[] = [];

  if (rest.startsWith('-')) {
    parts.push('Light');
    rest = rest.slice(1);
  } else if (rest.startsWith('+')) {
    parts.push('Heavy');
    rest = rest.slice(1);
  }

  let vicinity = false;
  if (rest.startsWith('VC')) {
    vicinity = true;
    rest = rest.slice(2);
  }

  const words: string[] = [];
  for (let i = 0; i < rest.length; i += 2) {
    const code = rest.slice(i, i + 2);
    if (code.length < 2) return null;
    const word = WX_DESCRIPTORS[code] ?? WX_PHENOMENA[code];
    if (!word) return null;
    words.push(word);
  }
  if (words.length === 0) return null;

  parts.push(...words);
  if (vicinity) parts.push('in the vicinity');

  const phrase = parts.join(' ');
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

// Decode a METAR wxString ("-RA BR") into prose ("Light rain, mist")
export function decodeWeatherString(
  wxString: string | null | undefined
): string | null {
  if (!wxString) return null;
  const decoded = wxString
    .trim()
    .split(/\s+/)
    .map(decodeWeatherToken)
    .filter((part): part is string => part !== null);

  if (decoded.length === 0) return null;
  return decoded
    .map((part, idx) => (idx === 0 ? part : part.charAt(0).toLowerCase() + part.slice(1)))
    .join(', ');
}

// ---------------------------------------------------------------------------
// Unit conversions and derived values
// ---------------------------------------------------------------------------

export const celsiusToFahrenheit = (celsius: number): number => celsius * 1.8 + 32;
export const fahrenheitToCelsius = (fahrenheit: number): number => (fahrenheit - 32) / 1.8;
export const metersToFeet = (meters: number): number => meters * 3.280839895;
export const hpaToInHg = (hpa: number): number => hpa * 0.0295299830714;

// Relative humidity from temperature and dew point (Magnus formula)
export function relativeHumidity(
  tempC: number | null | undefined,
  dewpC: number | null | undefined
): number | null {
  if (typeof tempC !== 'number' || typeof dewpC !== 'number') return null;
  const saturation = (t: number) => 6.112 * Math.exp((17.67 * t) / (t + 243.5));
  const rh = (100 * saturation(dewpC)) / saturation(tempC);
  return Math.max(0, Math.min(100, Math.round(rh)));
}

// Pressure altitude in feet from field elevation and altimeter setting
export function pressureAltitude(
  elevationFt: number | null | undefined,
  altimeterInHg: number | null | undefined
): number | null {
  if (typeof elevationFt !== 'number' || typeof altimeterInHg !== 'number') return null;
  return elevationFt + (29.92 - altimeterInHg) * 1000;
}

// Density altitude in feet, using the standard ISA-deviation approximation
export function densityAltitude(
  elevationFt: number | null | undefined,
  altimeterInHg: number | null | undefined,
  tempC: number | null | undefined
): number | null {
  const pa = pressureAltitude(elevationFt, altimeterInHg);
  if (pa === null || typeof tempC !== 'number') return null;
  const isaTempC = 15 - 1.98 * (pa / 1000);
  return Math.round(pa + 118.8 * (tempC - isaTempC));
}

// Format a ceiling for display. Null means no ceiling was reported.
export function formatCeiling(ceilingFt: number | null | undefined): string {
  if (ceilingFt === null || ceilingFt === undefined) return 'Unlimited';
  return `${ceilingFt.toLocaleString()} ft`;
}

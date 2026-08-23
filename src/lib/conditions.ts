// Normalizes the two observation sources — Synoptic 5-minute records and
// METAR — into one ObservedConditions shape so the UI never has to care which
// one it is rendering.

import { CloudLayer, ObservedConditions, WindDataPoint } from './types';
import type { MetarData } from '@/app/actions';
import {
  ceilingFromClouds,
  computeFlightCategory,
  decodeWeatherString,
  fahrenheitToCelsius,
  parseVisibility,
} from './weather';

// A record is only useful to the conditions panel if it carries something
// beyond wind.
export function hasConditionData(point: WindDataPoint | null | undefined): boolean {
  if (!point) return false;
  return (
    (point.clouds?.length ?? 0) > 0 ||
    point.visib !== null ||
    point.temp !== null ||
    point.altim !== null
  );
}

// Narrower than hasConditionData: a record only belongs on the sky history
// plot if it reports layers or visibility. Temperature alone would add an
// empty column.
export function hasSkyData(point: WindDataPoint | null | undefined): boolean {
  if (!point) return false;
  return (point.clouds?.length ?? 0) > 0 || point.visib !== null;
}

// Most recent 5-minute record that actually reports conditions. Stations drop
// sky/visibility from individual records, so the newest point is not always
// the newest usable one.
export function latestConditionObservation(
  observations: WindDataPoint[] | null | undefined
): WindDataPoint | null {
  if (!observations?.length) return null;
  for (let i = observations.length - 1; i >= 0; i--) {
    if (hasConditionData(observations[i])) return observations[i];
  }
  return null;
}

export function synopticToConditions(point: WindDataPoint): ObservedConditions {
  const clouds: CloudLayer[] = point.clouds ?? [];
  // Synoptic encodes "less than" as a negative visibility (-0.25 = < 1/4 mi)
  const rawVis = point.visib ?? null;
  const visibilityIsBelow = typeof rawVis === 'number' && rawVis < 0;

  return {
    source: 'synoptic',
    timestamp: point.timestamp ?? null,
    tempC: typeof point.temp === 'number' ? fahrenheitToCelsius(point.temp) : null,
    dewpC: typeof point.dewp === 'number' ? fahrenheitToCelsius(point.dewp) : null,
    visibilitySm: typeof rawVis === 'number' ? Math.abs(rawVis) : null,
    visibilityIsPlus: false,
    visibilityIsBelow,
    altimeterInHg: point.altim ?? null,
    clouds,
    // Synoptic reports a clear sky as a CLR layer rather than a summary field
    cover: clouds.length === 1 && clouds[0].cover === 'CLR' ? 'CLR' : null,
    weather: point.weather ?? null,
    vertVisFt: null,
    rawOb: null,
  };
}

export function metarToConditions(metar: MetarData): ObservedConditions {
  return {
    source: 'metar',
    timestamp: metar.obsTime ?? null,
    tempC: metar.temp,
    dewpC: metar.dewp,
    visibilitySm: parseVisibility(metar.visib),
    visibilityIsPlus:
      typeof metar.visib === 'string' && metar.visib.trim().endsWith('+'),
    visibilityIsBelow: typeof metar.visib === 'string' && /^M\d/i.test(metar.visib.trim()),
    altimeterInHg:
      typeof metar.altim === 'number' ? metar.altim * 0.0295299830714 : null,
    clouds: metar.clouds,
    cover: metar.cover,
    weather: decodeWeatherString(metar.wxString),
    vertVisFt: metar.vertVis,
    rawOb: metar.rawOb ?? null,
  };
}

// Ceiling and flight category for a normalized observation
export function conditionsCeiling(conditions: ObservedConditions): number | null {
  return ceilingFromClouds(conditions.clouds, conditions.vertVisFt);
}

export function conditionsFlightCategory(conditions: ObservedConditions) {
  return computeFlightCategory(conditionsCeiling(conditions), conditions.visibilitySm);
}

// Display string for a normalized visibility, preserving the "+"/"less than"
// qualifiers each source expresses differently.
export function formatConditionsVisibility(
  conditions: ObservedConditions
): string | null {
  const miles = conditions.visibilitySm;
  if (miles === null) return null;

  const formatted =
    miles >= 1 ? `${Math.round(miles * 10) / 10}` : formatSubMile(miles);
  if (conditions.visibilityIsBelow) return `< ${formatted} sm`;
  return `${formatted}${conditions.visibilityIsPlus ? '+' : ''} sm`;
}

function formatSubMile(value: number): string {
  const eighths = Math.round(value * 8);
  if (eighths <= 0) return '0';
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(eighths, 8);
  return `${eighths / divisor}/${8 / divisor}`;
}

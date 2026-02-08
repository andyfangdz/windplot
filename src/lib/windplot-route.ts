export type WindPlotViewMode = 'observations' | 'forecast';
export type WindPlotRouteMode = 'observation' | 'forecast';

export interface WindPlotRouteState {
  icao: string;
  mode: WindPlotRouteMode;
  durationHours: number;
}

export const DEFAULT_ICAO = 'KCDW';
export const DEFAULT_OBSERVATION_HOURS = 4;
export const DEFAULT_FORECAST_HOURS = 24;

const OBSERVATION_HOUR_OPTIONS = new Set([1, 2, 4, 6, 12, 24]);
const FORECAST_HOUR_OPTIONS = new Set([4, 8, 12, 24, 48, 72]);

function normalizeIcao(rawIcao?: string): string {
  const normalized = rawIcao?.trim().toUpperCase();
  return normalized || DEFAULT_ICAO;
}

function parseDurationHours(value?: string): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();

  const hourMatch = normalized.match(/^(\d+)h$/);
  if (hourMatch) return parseInt(hourMatch[1], 10);

  const dayMatch = normalized.match(/^(\d+)d$/);
  if (dayMatch) return parseInt(dayMatch[1], 10) * 24;

  const numeric = parseInt(normalized, 10);
  return Number.isFinite(numeric) ? numeric : null;
}

function normalizeObservationHours(hours: number | null): number {
  if (!hours) return DEFAULT_OBSERVATION_HOURS;
  return OBSERVATION_HOUR_OPTIONS.has(hours) ? hours : DEFAULT_OBSERVATION_HOURS;
}

function normalizeForecastHours(hours: number | null): number {
  if (!hours) return DEFAULT_FORECAST_HOURS;
  return FORECAST_HOUR_OPTIONS.has(hours) ? hours : DEFAULT_FORECAST_HOURS;
}

export function normalizeLegacyQueryRoute(params: {
  icao?: string;
  hours?: string;
}): WindPlotRouteState {
  return {
    icao: normalizeIcao(params.icao),
    mode: 'observation',
    durationHours: normalizeObservationHours(parseDurationHours(params.hours)),
  };
}

export function normalizePathRoute(params: {
  icao?: string;
  mode?: string;
  duration?: string;
}): WindPlotRouteState {
  const mode = params.mode?.toLowerCase() === 'forecast' ? 'forecast' : 'observation';
  const rawHours = parseDurationHours(params.duration);

  return {
    icao: normalizeIcao(params.icao),
    mode,
    durationHours: mode === 'forecast'
      ? normalizeForecastHours(rawHours)
      : normalizeObservationHours(rawHours),
  };
}

export function routeModeToViewMode(mode: WindPlotRouteMode): WindPlotViewMode {
  return mode === 'forecast' ? 'forecast' : 'observations';
}

export function buildWindPlotPath(route: WindPlotRouteState): string {
  return `/${route.icao}/${route.mode}/${route.durationHours}h`;
}

export function buildWindPlotPathForState(
  icao: string,
  viewMode: WindPlotViewMode,
  observationHours: number,
  forecastHours: number
): string {
  return buildWindPlotPath({
    icao: normalizeIcao(icao),
    mode: viewMode === 'forecast' ? 'forecast' : 'observation',
    durationHours: viewMode === 'forecast'
      ? normalizeForecastHours(forecastHours)
      : normalizeObservationHours(observationHours),
  });
}

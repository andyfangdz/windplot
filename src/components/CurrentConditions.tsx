'use client';

import { useMemo, useState } from 'react';
import { MetarData } from '@/app/actions';
import { WindDataPoint } from '@/lib/types';
import {
  conditionsCeiling,
  conditionsFlightCategory,
  formatConditionsVisibility,
  latestConditionObservation,
  metarToConditions,
  synopticToConditions,
} from '@/lib/conditions';
import {
  celsiusToFahrenheit,
  densityAltitude,
  describeCloudLayer,
  formatCeiling,
  formatCloudLayer,
  relativeHumidity,
} from '@/lib/weather';
import FlightCategoryBadge from './FlightCategoryBadge';
import SkyDiagram from './SkyDiagram';
import StatTile from './StatTile';

interface CurrentConditionsProps {
  observations: WindDataPoint[];
  metar: MetarData | null;
  elevationFt: number | null;
  now: number; // Current timestamp in ms, for the observation age
}

export default function CurrentConditions({
  observations,
  metar,
  elevationFt,
  now,
}: CurrentConditionsProps) {
  const [preferredSource, setPreferredSource] = useState<'5min' | 'metar'>('5min');

  // The 5-minute feed carries conditions only for stations with the sensors,
  // so METAR stays the fallback rather than leaving the panel empty.
  const synoptic = useMemo(
    () => latestConditionObservation(observations),
    [observations]
  );

  const source = preferredSource === '5min' && !synoptic ? 'metar' : preferredSource;

  const conditions = useMemo(() => {
    if (source === 'metar') return metar ? metarToConditions(metar) : null;
    return synoptic ? synopticToConditions(synoptic) : null;
  }, [source, metar, synoptic]);

  const derived = useMemo(() => {
    if (!conditions) return null;
    return {
      ceiling: conditionsCeiling(conditions),
      category: conditionsFlightCategory(conditions),
      humidity: relativeHumidity(conditions.tempC, conditions.dewpC),
      densityAlt: densityAltitude(
        elevationFt,
        conditions.altimeterInHg,
        conditions.tempC
      ),
      visibility: formatConditionsVisibility(conditions),
    };
  }, [conditions, elevationFt]);

  if (!conditions || !derived) return null;

  const ageMinutes = conditions.timestamp
    ? Math.round((now - conditions.timestamp * 1000) / 60000)
    : null;

  const cloudSummary = conditions.clouds.length
    ? conditions.clouds.map(formatCloudLayer).join(' ')
    : conditions.cover ?? '—';

  const tempF =
    typeof conditions.tempC === 'number'
      ? Math.round(celsiusToFahrenheit(conditions.tempC))
      : null;
  const dewpF =
    typeof conditions.dewpC === 'number'
      ? Math.round(celsiusToFahrenheit(conditions.dewpC))
      : null;

  // A lone CLR layer is Synoptic's way of saying "clear", not a real layer
  const drawableClouds = conditions.clouds.filter((layer) => layer.base !== null);

  return (
    <div className="chart-section">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="chart-title mb-0">Current Conditions</div>
        <div className="flex items-center gap-2">
          <FlightCategoryBadge category={derived.category} />
          {ageMinutes !== null && (
            <span className="text-[10px] text-[var(--text-tertiary)]">
              {ageMinutes <= 1 ? 'just now' : `${ageMinutes} min ago`}
            </span>
          )}
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setPreferredSource('5min')}
              disabled={!synoptic}
              title={
                synoptic
                  ? '5-minute observation'
                  : 'This station does not report conditions in the 5-minute feed'
              }
              className={`px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                source === '5min'
                  ? 'bg-[#1d9bf0] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              5-min
            </button>
            <button
              onClick={() => setPreferredSource('metar')}
              disabled={!metar}
              className={`px-2 py-1 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                source === 'metar'
                  ? 'bg-[#1d9bf0] text-white'
                  : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]'
              }`}
            >
              METAR
            </button>
          </div>
        </div>
      </div>

      {preferredSource === '5min' && !synoptic && (
        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg p-2 mb-3 text-center">
          <p className="text-amber-400 text-xs">
            No sky or visibility in the 5-minute feed for this station — showing METAR
          </p>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
        <div>
          <SkyDiagram
            clouds={drawableClouds}
            vertVis={conditions.vertVisFt}
            clearLabel={
              conditions.cover === 'CLR' || conditions.cover === 'SKC'
                ? 'Sky clear'
                : 'No layers reported'
            }
          />
          <div className="text-[11px] text-[var(--text-secondary)] mt-2 leading-relaxed">
            {drawableClouds.length
              ? drawableClouds.map(describeCloudLayer).join(' · ')
              : 'No cloud layers reported'}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2 mt-4 lg:mt-0">
          <StatTile
            label="Visibility"
            value={derived.visibility ?? '—'}
            title="Surface visibility in statute miles"
          />
          <StatTile
            label="Ceiling"
            value={formatCeiling(derived.ceiling)}
            sub={derived.ceiling !== null ? 'AGL' : 'no BKN/OVC layer'}
            title="Lowest broken or overcast layer"
          />
          <StatTile label="Clouds" value={cloudSummary} title="Reported cloud layers" />
          <StatTile
            label="Temp / Dew"
            value={
              conditions.tempC !== null && conditions.dewpC !== null
                ? `${Math.round(conditions.tempC)}° / ${Math.round(conditions.dewpC)}°C`
                : '—'
            }
            sub={tempF !== null && dewpF !== null ? `${tempF}° / ${dewpF}°F` : null}
          />
          <StatTile
            label="Humidity"
            value={derived.humidity !== null ? `${derived.humidity}%` : '—'}
            title="Relative humidity derived from temperature and dew point"
          />
          <StatTile
            label="Altimeter"
            value={
              conditions.altimeterInHg !== null
                ? conditions.altimeterInHg.toFixed(2)
                : '—'
            }
            sub={
              conditions.altimeterInHg !== null
                ? `${Math.round(conditions.altimeterInHg / 0.0295299830714)} hPa`
                : null
            }
            title="Altimeter setting in inches of mercury"
          />
          {derived.densityAlt !== null && (
            <StatTile
              label="Density Alt"
              value={`${derived.densityAlt.toLocaleString()} ft`}
              sub={
                elevationFt !== null
                  ? `field ${Math.round(elevationFt).toLocaleString()} ft`
                  : null
              }
              title="Density altitude — pressure altitude corrected for temperature"
            />
          )}
          {conditions.weather && (
            <StatTile label="Weather" value={conditions.weather} />
          )}
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-[var(--border-color)]">
        <p className="font-mono text-[10px] text-[var(--text-tertiary)] break-all">
          {conditions.rawOb ??
            `Synoptic 5-minute observation${synoptic?.time ? ` at ${synoptic.time} local` : ''}`}
        </p>
        {conditions.source === 'synoptic' && (
          <p className="text-[10px] text-[var(--text-tertiary)] mt-1">
            The 5-minute sensor reports at most 3 layers below 12,000 ft — switch to
            METAR for higher layers.
          </p>
        )}
      </div>
    </div>
  );
}

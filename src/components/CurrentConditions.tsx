'use client';

import { useMemo } from 'react';
import { MetarData } from '@/app/actions';
import {
  celsiusToFahrenheit,
  ceilingFromClouds,
  computeFlightCategory,
  decodeWeatherString,
  describeCloudLayer,
  densityAltitude,
  formatCeiling,
  formatCloudLayer,
  formatVisibility,
  hpaToInHg,
  metersToFeet,
  parseVisibility,
  relativeHumidity,
} from '@/lib/weather';
import FlightCategoryBadge from './FlightCategoryBadge';
import SkyDiagram from './SkyDiagram';
import StatTile from './StatTile';

interface CurrentConditionsProps {
  metar: MetarData | null;
  now: number; // Current timestamp in ms, for the observation age
}

export default function CurrentConditions({ metar, now }: CurrentConditionsProps) {
  const derived = useMemo(() => {
    if (!metar) return null;

    const ceiling = ceilingFromClouds(metar.clouds, metar.vertVis);
    const visibilityMiles = parseVisibility(metar.visib);
    const category = computeFlightCategory(ceiling, visibilityMiles);
    const altimeterInHg =
      typeof metar.altim === 'number' ? hpaToInHg(metar.altim) : null;
    const elevationFt =
      typeof metar.elev === 'number' ? Math.round(metersToFeet(metar.elev)) : null;

    return {
      ceiling,
      category,
      altimeterInHg,
      elevationFt,
      humidity: relativeHumidity(metar.temp, metar.dewp),
      densityAlt: densityAltitude(elevationFt, altimeterInHg, metar.temp),
      weather: decodeWeatherString(metar.wxString),
      visibility: formatVisibility(metar.visib),
    };
  }, [metar]);

  if (!metar || !derived) return null;

  const hasAnyCondition =
    metar.clouds.length > 0 ||
    metar.cover !== null ||
    metar.visib !== null ||
    metar.temp !== null ||
    metar.altim !== null;
  if (!hasAnyCondition) return null;

  const ageMinutes = metar.obsTime
    ? Math.round((now - metar.obsTime * 1000) / 60000)
    : null;

  // With no layers reported the API still tells us the summary cover (e.g. CLR)
  const cloudSummary = metar.clouds.length
    ? metar.clouds.map(formatCloudLayer).join(' ')
    : metar.cover ?? '—';

  const tempF =
    typeof metar.temp === 'number' ? Math.round(celsiusToFahrenheit(metar.temp)) : null;
  const dewpF =
    typeof metar.dewp === 'number' ? Math.round(celsiusToFahrenheit(metar.dewp)) : null;

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
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-2 lg:gap-4 lg:items-start">
        <div>
          <SkyDiagram
            clouds={metar.clouds}
            vertVis={metar.vertVis}
            clearLabel={metar.cover === 'CLR' || metar.cover === 'SKC' ? 'Sky clear' : 'No layers reported'}
          />
          <div className="text-[11px] text-[var(--text-secondary)] mt-2 leading-relaxed">
            {metar.clouds.length
              ? metar.clouds.map(describeCloudLayer).join(' · ')
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
          <StatTile
            label="Clouds"
            value={cloudSummary}
            title="Reported cloud layers"
          />
          <StatTile
            label="Temp / Dew"
            value={
              metar.temp !== null && metar.dewp !== null
                ? `${Math.round(metar.temp)}° / ${Math.round(metar.dewp)}°C`
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
              derived.altimeterInHg !== null
                ? derived.altimeterInHg.toFixed(2)
                : '—'
            }
            sub={metar.altim !== null ? `${Math.round(metar.altim)} hPa` : null}
            title="Altimeter setting in inches of mercury"
          />
          {derived.densityAlt !== null && (
            <StatTile
              label="Density Alt"
              value={`${derived.densityAlt.toLocaleString()} ft`}
              sub={
                derived.elevationFt !== null
                  ? `field ${derived.elevationFt.toLocaleString()} ft`
                  : null
              }
              title="Density altitude — pressure altitude corrected for temperature"
            />
          )}
          {derived.weather && (
            <StatTile label="Weather" value={derived.weather} title={metar.wxString ?? undefined} />
          )}
        </div>
      </div>

      {metar.rawOb && (
        <p className="font-mono text-[10px] text-[var(--text-tertiary)] break-all mt-3 pt-3 border-t border-[var(--border-color)]">
          {metar.rawOb}
        </p>
      )}
    </div>
  );
}

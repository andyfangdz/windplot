import { describe, it, expect } from 'vitest';
import {
  conditionsCeiling,
  conditionsFlightCategory,
  formatConditionsVisibility,
  hasConditionData,
  hasSkyData,
  latestConditionObservation,
  metarToConditions,
  synopticToConditions,
} from '@/lib/conditions';
import { WindDataPoint } from '@/lib/types';
import type { MetarData } from '@/app/actions';

function obs(overrides: Partial<WindDataPoint> = {}): WindDataPoint {
  return {
    time: '15:55',
    timestamp: 1785682500,
    wspd: 7,
    wgst: null,
    wdir: 190,
    temp: null,
    dewp: null,
    visib: null,
    altim: null,
    clouds: [],
    weather: null,
    ...overrides,
  };
}

function metar(overrides: Partial<MetarData> = {}): MetarData {
  return {
    wdir: 190,
    wspd: 7,
    wgst: null,
    temp: 28.3,
    dewp: 19.4,
    visib: '10+',
    altim: 1014,
    clouds: [],
    cover: 'CLR',
    wxString: null,
    vertVis: null,
    elev: 52,
    rawOb: 'METAR KCDW 021453Z 19007KT 10SM CLR 28/19 A2994',
    obsTime: 1785682380,
    ...overrides,
  };
}

describe('hasConditionData', () => {
  it('rejects a wind-only record', () => {
    expect(hasConditionData(obs())).toBe(false);
  });

  it('accepts a record with any condition field', () => {
    expect(hasConditionData(obs({ visib: 10 }))).toBe(true);
    expect(hasConditionData(obs({ temp: 68 }))).toBe(true);
    expect(hasConditionData(obs({ altim: 29.92 }))).toBe(true);
    expect(hasConditionData(obs({ clouds: [{ cover: 'BKN', base: 2200 }] }))).toBe(true);
  });

  it('handles missing input', () => {
    expect(hasConditionData(null)).toBe(false);
    expect(hasConditionData(undefined)).toBe(false);
  });
});

describe('hasSkyData', () => {
  it('requires layers or visibility, not just temperature', () => {
    expect(hasSkyData(obs({ temp: 68, altim: 29.92 }))).toBe(false);
    expect(hasSkyData(obs({ visib: 10 }))).toBe(true);
    expect(hasSkyData(obs({ clouds: [{ cover: 'BKN', base: 2200 }] }))).toBe(true);
  });

  it('handles missing input', () => {
    expect(hasSkyData(null)).toBe(false);
    expect(hasSkyData(undefined)).toBe(false);
  });
});

describe('latestConditionObservation', () => {
  it('returns the newest record that reports conditions', () => {
    const points = [
      obs({ timestamp: 1, visib: 10 }),
      obs({ timestamp: 2, visib: 6 }),
      obs({ timestamp: 3 }), // wind only — must be skipped
    ];
    expect(latestConditionObservation(points)?.timestamp).toBe(2);
  });

  it('returns null when no record has conditions', () => {
    expect(latestConditionObservation([obs(), obs()])).toBeNull();
    expect(latestConditionObservation([])).toBeNull();
    expect(latestConditionObservation(null)).toBeNull();
  });
});

describe('synopticToConditions', () => {
  it('converts Fahrenheit readings to Celsius', () => {
    const c = synopticToConditions(obs({ temp: 82, dewp: 68 }));
    expect(c.tempC).toBeCloseTo(27.8, 1);
    expect(c.dewpC).toBeCloseTo(20, 1);
  });

  it('carries visibility and altimeter through unchanged', () => {
    const c = synopticToConditions(obs({ visib: 10, altim: 29.93 }));
    expect(c.visibilitySm).toBe(10);
    expect(c.altimeterInHg).toBe(29.93);
    expect(c.visibilityIsBelow).toBe(false);
  });

  it('reads a negative visibility as "less than"', () => {
    const c = synopticToConditions(obs({ visib: -0.25 }));
    expect(c.visibilitySm).toBe(0.25);
    expect(c.visibilityIsBelow).toBe(true);
    expect(formatConditionsVisibility(c)).toBe('< 1/4 sm');
  });

  it('treats a lone CLR layer as a clear summary', () => {
    const c = synopticToConditions(obs({ clouds: [{ cover: 'CLR', base: null }] }));
    expect(c.cover).toBe('CLR');
    expect(conditionsCeiling(c)).toBeNull();
    expect(conditionsFlightCategory(c)).toBeNull();
  });

  it('derives ceiling and category from decoded layers', () => {
    const c = synopticToConditions(
      obs({
        visib: 10,
        clouds: [
          { cover: 'SCT', base: 2200 },
          { cover: 'BKN', base: 800 },
        ],
      })
    );
    expect(conditionsCeiling(c)).toBe(800);
    expect(conditionsFlightCategory(c)).toBe('IFR');
  });

  it('has no raw observation text', () => {
    expect(synopticToConditions(obs()).rawOb).toBeNull();
    expect(synopticToConditions(obs()).source).toBe('synoptic');
  });
});

describe('metarToConditions', () => {
  it('keeps Celsius readings as-is', () => {
    const c = metarToConditions(metar());
    expect(c.tempC).toBe(28.3);
    expect(c.dewpC).toBe(19.4);
  });

  it('converts hectopascals to inches of mercury', () => {
    expect(metarToConditions(metar({ altim: 1013.25 })).altimeterInHg).toBeCloseTo(
      29.92,
      2
    );
  });

  it('preserves the "10+" qualifier', () => {
    const c = metarToConditions(metar());
    expect(c.visibilitySm).toBe(10);
    expect(c.visibilityIsPlus).toBe(true);
    expect(formatConditionsVisibility(c)).toBe('10+ sm');
  });

  it('reads an M-prefixed visibility as "less than"', () => {
    const c = metarToConditions(metar({ visib: 'M1/4' }));
    expect(c.visibilityIsBelow).toBe(true);
    expect(formatConditionsVisibility(c)).toBe('< 1/4 sm');
  });

  it('decodes present weather', () => {
    expect(metarToConditions(metar({ wxString: '-RA BR' })).weather).toBe(
      'Light rain, mist'
    );
  });

  it('uses vertical visibility as an indefinite ceiling', () => {
    const c = metarToConditions(metar({ vertVis: 300, visib: '1/2' }));
    expect(conditionsCeiling(c)).toBe(300);
    expect(conditionsFlightCategory(c)).toBe('LIFR');
  });
});

// Mirrors the source selection in CurrentConditions: the preference sticks
// across airport changes, so the fallback has to run in both directions.
function resolveSource(
  preferred: '5min' | 'metar',
  hasSynoptic: boolean,
  hasMetar: boolean
): '5min' | 'metar' {
  return preferred === '5min'
    ? hasSynoptic
      ? '5min'
      : 'metar'
    : hasMetar
      ? 'metar'
      : '5min';
}

describe('source fallback', () => {
  it('honours the preference when that source has data', () => {
    expect(resolveSource('5min', true, true)).toBe('5min');
    expect(resolveSource('metar', true, true)).toBe('metar');
  });

  it('falls back to METAR when the 5-minute feed has no conditions', () => {
    expect(resolveSource('5min', false, true)).toBe('metar');
  });

  it('falls back to the 5-minute feed when METAR is missing', () => {
    // Preferring METAR then switching to an airport with no METAR response
    // used to blank the panel even though 5-minute data was available
    expect(resolveSource('metar', true, false)).toBe('5min');
  });

  it('picks a source even when neither has data, so the panel decides', () => {
    expect(resolveSource('5min', false, false)).toBe('metar');
    expect(resolveSource('metar', false, false)).toBe('5min');
  });
});

describe('both sources agree on identical weather', () => {
  it('produces the same ceiling, category and visibility', () => {
    const layers = [
      { cover: 'SCT', base: 2000 },
      { cover: 'OVC', base: 900 },
    ];
    const fromSynoptic = synopticToConditions(
      obs({ visib: 8, temp: 61, dewp: 54, altim: 29.93, clouds: layers })
    );
    const fromMetar = metarToConditions(
      metar({ visib: 8, temp: 16, dewp: 12, altim: 1013.5, clouds: layers, cover: 'OVC' })
    );

    expect(conditionsCeiling(fromSynoptic)).toBe(conditionsCeiling(fromMetar));
    expect(conditionsFlightCategory(fromSynoptic)).toBe('IFR');
    expect(conditionsFlightCategory(fromMetar)).toBe('IFR');
    expect(formatConditionsVisibility(fromSynoptic)).toBe(
      formatConditionsVisibility(fromMetar)
    );
    expect(fromSynoptic.tempC).toBeCloseTo(fromMetar.tempC!, 0);
  });
});

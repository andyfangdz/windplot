import { describe, expect, it } from 'vitest';
import {
  buildWindPlotPathForState,
  normalizeLegacyQueryRoute,
  normalizePathRoute,
} from './windplot-route';

describe('windplot route helpers', () => {
  it('normalizes legacy query params to observation route state', () => {
    expect(normalizeLegacyQueryRoute({ icao: 'kfrg', hours: '6' })).toEqual({
      icao: 'KFRG',
      mode: 'observation',
      durationHours: 6,
    });
  });

  it('falls back to defaults for invalid legacy params', () => {
    expect(normalizeLegacyQueryRoute({ icao: '', hours: '999' })).toEqual({
      icao: 'KCDW',
      mode: 'observation',
      durationHours: 4,
    });
  });

  it('parses forecast path hours', () => {
    expect(normalizePathRoute({ icao: 'KTEB', mode: 'forecast', duration: '48h' })).toEqual({
      icao: 'KTEB',
      mode: 'forecast',
      durationHours: 48,
    });
  });

  it('parses day-based forecast paths', () => {
    expect(normalizePathRoute({ icao: 'KTEB', mode: 'forecast', duration: '2d' })).toEqual({
      icao: 'KTEB',
      mode: 'forecast',
      durationHours: 48,
    });
  });

  it('falls back to observation mode when mode segment is invalid', () => {
    expect(normalizePathRoute({ icao: 'KTEB', mode: 'foo', duration: '8h' })).toEqual({
      icao: 'KTEB',
      mode: 'observation',
      durationHours: 4,
    });
  });

  it('builds canonical paths from client state', () => {
    expect(buildWindPlotPathForState('kteb', 'observations', 12, 24)).toBe('/KTEB/observation/12h');
    expect(buildWindPlotPathForState('kteb', 'forecast', 12, 24)).toBe('/KTEB/forecast/24h');
  });
});

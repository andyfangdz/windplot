import { describe, it, expect } from 'vitest';
import {
  ceilingFromClouds,
  cloudCoverOktas,
  computeFlightCategory,
  decodeSynopticCloudLayer,
  decodeWeatherString,
  normalizeAltimeterToInHg,
  densityAltitude,
  describeCloudLayer,
  formatCeiling,
  formatCloudLayer,
  formatVisibility,
  hpaToInHg,
  isCeilingLayer,
  lowestCloudBase,
  parseVisibility,
  pressureAltitude,
  relativeHumidity,
  skyCoverCode,
} from '@/lib/weather';

describe('parseVisibility', () => {
  it('parses plain numbers', () => {
    expect(parseVisibility(7)).toBe(7);
    expect(parseVisibility(2.5)).toBe(2.5);
  });

  it('parses numeric strings', () => {
    expect(parseVisibility('6')).toBe(6);
    expect(parseVisibility('2.5')).toBe(2.5);
  });

  it('parses "10+" as 10', () => {
    expect(parseVisibility('10+')).toBe(10);
  });

  it('parses simple fractions', () => {
    expect(parseVisibility('1/2')).toBe(0.5);
    expect(parseVisibility('3/4')).toBe(0.75);
  });

  it('parses mixed fractions', () => {
    expect(parseVisibility('1 1/2')).toBe(1.5);
    expect(parseVisibility('2 1/4')).toBe(2.25);
  });

  it('parses "less than" values', () => {
    expect(parseVisibility('M1/4')).toBe(0.25);
  });

  it('strips an SM suffix', () => {
    expect(parseVisibility('3 SM')).toBe(3);
  });

  it('returns null for missing or unparseable values', () => {
    expect(parseVisibility(null)).toBeNull();
    expect(parseVisibility(undefined)).toBeNull();
    expect(parseVisibility('')).toBeNull();
    expect(parseVisibility('abc')).toBeNull();
  });
});

describe('formatVisibility', () => {
  it('keeps the "or more" marker', () => {
    expect(formatVisibility('10+')).toBe('10+ sm');
  });

  it('formats whole and decimal miles', () => {
    expect(formatVisibility(3)).toBe('3 sm');
    expect(formatVisibility(2.5)).toBe('2.5 sm');
  });

  it('formats sub-mile visibility as a fraction', () => {
    expect(formatVisibility('1/2')).toBe('1/2 sm');
    expect(formatVisibility(0.25)).toBe('1/4 sm');
  });

  it('returns null when there is nothing to format', () => {
    expect(formatVisibility(null)).toBeNull();
  });
});

describe('cloud layers', () => {
  it('identifies which covers make a ceiling', () => {
    expect(isCeilingLayer('BKN')).toBe(true);
    expect(isCeilingLayer('OVC')).toBe(true);
    expect(isCeilingLayer('OVX')).toBe(true);
    expect(isCeilingLayer('SCT')).toBe(false);
    expect(isCeilingLayer('FEW')).toBe(false);
    expect(isCeilingLayer(null)).toBe(false);
  });

  it('returns the lowest broken or overcast layer as the ceiling', () => {
    const clouds = [
      { cover: 'FEW', base: 2000 },
      { cover: 'SCT', base: 7000 },
      { cover: 'BKN', base: 12000 },
      { cover: 'OVC', base: 17000 },
    ];
    expect(ceilingFromClouds(clouds)).toBe(12000);
  });

  it('returns null when no layer constitutes a ceiling', () => {
    expect(ceilingFromClouds([{ cover: 'FEW', base: 2000 }])).toBeNull();
    expect(ceilingFromClouds([])).toBeNull();
    expect(ceilingFromClouds(null)).toBeNull();
  });

  it('treats vertical visibility as an indefinite ceiling', () => {
    expect(ceilingFromClouds([], 300)).toBe(300);
    expect(ceilingFromClouds([{ cover: 'OVC', base: 900 }], 300)).toBe(300);
  });

  it('finds the lowest layer of any coverage', () => {
    const clouds = [
      { cover: 'SCT', base: 7000 },
      { cover: 'FEW', base: 2000 },
      { cover: 'CLR', base: null },
    ];
    expect(lowestCloudBase(clouds)).toBe(2000);
    expect(lowestCloudBase([])).toBeNull();
  });

  it('formats layers METAR-style', () => {
    expect(formatCloudLayer({ cover: 'BKN', base: 12000 })).toBe('BKN120');
    expect(formatCloudLayer({ cover: 'FEW', base: 2000 })).toBe('FEW020');
    expect(formatCloudLayer({ cover: 'OVC', base: 400 })).toBe('OVC004');
    expect(formatCloudLayer({ cover: 'CLR', base: null })).toBe('CLR');
  });

  it('describes layers in prose', () => {
    expect(describeCloudLayer({ cover: 'BKN', base: 12000 })).toBe('Broken at 12,000 ft');
    expect(describeCloudLayer({ cover: 'SKC', base: null })).toBe('Sky clear');
  });

  it('maps coverage to oktas for shading', () => {
    expect(cloudCoverOktas('CLR')).toBe(0);
    expect(cloudCoverOktas('FEW')).toBe(2);
    expect(cloudCoverOktas('SCT')).toBe(4);
    expect(cloudCoverOktas('BKN')).toBe(6);
    expect(cloudCoverOktas('OVC')).toBe(8);
  });
});

describe('decodeSynopticCloudLayer', () => {
  it('decodes the documented examples', () => {
    // Synoptic docs: 222 = 2,200 ft scattered, 807 = 8,000 ft thin broken
    expect(decodeSynopticCloudLayer(222)).toEqual({ cover: 'SCT', base: 2200 });
    expect(decodeSynopticCloudLayer(807)).toEqual({ cover: 'BKN', base: 8000 });
    expect(decodeSynopticCloudLayer(2504)).toEqual({ cover: 'OVC', base: 25000 });
  });

  it('decodes each sky condition digit', () => {
    expect(decodeSynopticCloudLayer(103)?.cover).toBe('BKN');
    expect(decodeSynopticCloudLayer(104)?.cover).toBe('OVC');
    expect(decodeSynopticCloudLayer(105)?.cover).toBe('OVX');
    expect(decodeSynopticCloudLayer(102)?.cover).toBe('SCT');
  });

  it('maps thin variants to their base coverage', () => {
    expect(decodeSynopticCloudLayer(106)?.cover).toBe('SCT');
    expect(decodeSynopticCloudLayer(107)?.cover).toBe('BKN');
    expect(decodeSynopticCloudLayer(108)?.cover).toBe('OVC');
    expect(decodeSynopticCloudLayer(109)?.cover).toBe('OVX');
  });

  it('returns a clear layer with no base', () => {
    expect(decodeSynopticCloudLayer(1)).toEqual({ cover: 'CLR', base: null });
  });

  it('returns null for missing or invalid codes', () => {
    expect(decodeSynopticCloudLayer(0)).toBeNull();   // missing
    expect(decodeSynopticCloudLayer(250)).toBeNull(); // trailing 0 = missing
    expect(decodeSynopticCloudLayer(null)).toBeNull();
    expect(decodeSynopticCloudLayer(undefined)).toBeNull();
    expect(decodeSynopticCloudLayer(-5)).toBeNull();
    expect(decodeSynopticCloudLayer(NaN)).toBeNull();
  });

  it('produces layers the ceiling helper understands', () => {
    const layers = [222, 807, 2504]
      .map(decodeSynopticCloudLayer)
      .filter((l): l is NonNullable<typeof l> => l !== null);
    // 8,000 ft broken is the lowest ceiling layer
    expect(ceilingFromClouds(layers)).toBe(8000);
  });
});

describe('normalizeAltimeterToInHg', () => {
  it('passes through inches of mercury', () => {
    expect(normalizeAltimeterToInHg(29.92)).toBeCloseTo(29.92, 4);
  });

  it('converts hectopascals', () => {
    expect(normalizeAltimeterToInHg(1013.25)).toBeCloseTo(29.92, 2);
  });

  it('converts pascals', () => {
    expect(normalizeAltimeterToInHg(101325)).toBeCloseTo(29.92, 2);
  });

  it('returns null for missing or nonsensical values', () => {
    expect(normalizeAltimeterToInHg(null)).toBeNull();
    expect(normalizeAltimeterToInHg(undefined)).toBeNull();
    expect(normalizeAltimeterToInHg(0)).toBeNull();
    expect(normalizeAltimeterToInHg(-5)).toBeNull();
  });
});

describe('skyCoverCode', () => {
  it('converts NBM sky percentages to coverage codes', () => {
    expect(skyCoverCode(0)).toBe('SKC');
    expect(skyCoverCode(20)).toBe('FEW');
    expect(skyCoverCode(45)).toBe('SCT');
    expect(skyCoverCode(70)).toBe('BKN');
    expect(skyCoverCode(97)).toBe('OVC');
  });

  it('returns null for missing values', () => {
    expect(skyCoverCode(null)).toBeNull();
    expect(skyCoverCode(undefined)).toBeNull();
  });
});

describe('computeFlightCategory', () => {
  it('classifies by ceiling', () => {
    expect(computeFlightCategory(5000, 10)).toBe('VFR');
    expect(computeFlightCategory(2500, 10)).toBe('MVFR');
    expect(computeFlightCategory(800, 10)).toBe('IFR');
    expect(computeFlightCategory(300, 10)).toBe('LIFR');
  });

  it('classifies by visibility', () => {
    expect(computeFlightCategory(null, 10)).toBe('VFR');
    expect(computeFlightCategory(null, 4)).toBe('MVFR');
    expect(computeFlightCategory(null, 2)).toBe('IFR');
    expect(computeFlightCategory(null, 0.5)).toBe('LIFR');
  });

  it('takes the more restrictive of ceiling and visibility', () => {
    expect(computeFlightCategory(5000, 2)).toBe('IFR');
    expect(computeFlightCategory(600, 10)).toBe('IFR');
    expect(computeFlightCategory(2000, 0.75)).toBe('LIFR');
  });

  it('handles category boundaries', () => {
    expect(computeFlightCategory(3000, 10)).toBe('MVFR');
    expect(computeFlightCategory(3001, 10)).toBe('VFR');
    expect(computeFlightCategory(1000, 10)).toBe('MVFR');
    expect(computeFlightCategory(999, 10)).toBe('IFR');
    expect(computeFlightCategory(null, 5)).toBe('MVFR');
    expect(computeFlightCategory(null, 3)).toBe('MVFR');
    expect(computeFlightCategory(null, 2.99)).toBe('IFR');
  });

  it('returns null when nothing is known', () => {
    expect(computeFlightCategory(null, null)).toBeNull();
  });
});

describe('formatCeiling', () => {
  it('reports unlimited when there is no ceiling', () => {
    expect(formatCeiling(null)).toBe('Unlimited');
    expect(formatCeiling(undefined)).toBe('Unlimited');
  });

  it('formats a ceiling in feet', () => {
    expect(formatCeiling(1200)).toBe('1,200 ft');
  });
});

describe('decodeWeatherString', () => {
  it('decodes intensity and phenomena', () => {
    expect(decodeWeatherString('-RA')).toBe('Light rain');
    expect(decodeWeatherString('+SN')).toBe('Heavy snow');
    expect(decodeWeatherString('RA')).toBe('Rain');
  });

  it('decodes descriptors', () => {
    expect(decodeWeatherString('TSRA')).toBe('Thunderstorm rain');
    expect(decodeWeatherString('FZRA')).toBe('Freezing rain');
    expect(decodeWeatherString('-SHRA')).toBe('Light showers of rain');
  });

  it('decodes vicinity groups', () => {
    expect(decodeWeatherString('VCTS')).toBe('Thunderstorm in the vicinity');
  });

  it('joins multiple groups', () => {
    expect(decodeWeatherString('-RA BR')).toBe('Light rain, mist');
  });

  it('returns null when there is no weather', () => {
    expect(decodeWeatherString(null)).toBeNull();
    expect(decodeWeatherString('')).toBeNull();
    expect(decodeWeatherString('ZZ')).toBeNull();
  });
});

describe('derived values', () => {
  it('converts hectopascals to inches of mercury', () => {
    expect(hpaToInHg(1013.25)).toBeCloseTo(29.92, 2);
  });

  it('computes relative humidity', () => {
    expect(relativeHumidity(20, 20)).toBe(100);
    expect(relativeHumidity(28.3, 19.4)).toBe(59);
    expect(relativeHumidity(null, 10)).toBeNull();
  });

  it('computes pressure altitude', () => {
    expect(pressureAltitude(500, 29.92)).toBeCloseTo(500, 5);
    expect(pressureAltitude(500, 30.92)).toBeCloseTo(-500, 5);
    expect(pressureAltitude(null, 29.92)).toBeNull();
  });

  it('computes density altitude', () => {
    // At sea level with standard pressure, 15C is exactly sea level
    expect(densityAltitude(0, 29.92, 15)).toBe(0);
    // Hotter than standard puts density altitude above field elevation
    expect(densityAltitude(0, 29.92, 35)).toBeGreaterThan(2000);
    expect(densityAltitude(0, 29.92, null)).toBeNull();
  });
});

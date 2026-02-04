import { describe, it, expect } from 'vitest';
import { getNearbyAirports } from './actions';

describe('getNearbyAirports', () => {
  describe('basic functionality', () => {
    it('returns nearby airports for a valid ICAO code', async () => {
      const nearby = await getNearbyAirports('KFRG', 30, 10);

      expect(Array.isArray(nearby)).toBe(true);
      expect(nearby.length).toBeGreaterThan(0);
      expect(nearby.length).toBeLessThanOrEqual(10);
    });

    it('returns airports sorted by distance (nearest first)', async () => {
      const nearby = await getNearbyAirports('KFRG', 30, 10);

      for (let i = 1; i < nearby.length; i++) {
        expect(nearby[i].distance).toBeGreaterThanOrEqual(nearby[i - 1].distance);
      }
    });

    it('does not include the source airport in results', async () => {
      const nearby = await getNearbyAirports('KFRG', 30, 10);

      const hasSourceAirport = nearby.some((a) => a.icao === 'KFRG');
      expect(hasSourceAirport).toBe(false);
    });

    it('returns correct NearbyAirport structure', async () => {
      const nearby = await getNearbyAirports('KFRG', 30, 10);

      expect(nearby.length).toBeGreaterThan(0);
      const first = nearby[0];

      expect(first).toHaveProperty('icao');
      expect(first).toHaveProperty('name');
      expect(first).toHaveProperty('city');
      expect(first).toHaveProperty('state');
      expect(first).toHaveProperty('distance');
      expect(typeof first.icao).toBe('string');
      expect(typeof first.distance).toBe('number');
    });
  });

  describe('distance filtering', () => {
    it('respects the radius parameter', async () => {
      const nearby30nm = await getNearbyAirports('KFRG', 30, 50);
      const nearby10nm = await getNearbyAirports('KFRG', 10, 50);

      // All results should be within the specified radius
      for (const airport of nearby10nm) {
        expect(airport.distance).toBeLessThanOrEqual(10);
      }

      // Larger radius should return same or more results
      expect(nearby30nm.length).toBeGreaterThanOrEqual(nearby10nm.length);
    });

    it('returns empty array for very small radius with no nearby airports', async () => {
      // 0.1nm radius - unlikely to have any airports
      const nearby = await getNearbyAirports('KFRG', 0.1, 10);
      expect(nearby.length).toBe(0);
    });
  });

  describe('limit parameter', () => {
    it('respects the limit parameter', async () => {
      const nearby3 = await getNearbyAirports('KFRG', 30, 3);
      const nearby10 = await getNearbyAirports('KFRG', 30, 10);

      expect(nearby3.length).toBeLessThanOrEqual(3);
      expect(nearby10.length).toBeLessThanOrEqual(10);
    });

    it('returns fewer than limit if not enough airports exist', async () => {
      // Request 100 airports within 5nm - unlikely to find that many
      const nearby = await getNearbyAirports('KFRG', 5, 100);
      expect(nearby.length).toBeLessThan(100);
    });
  });

  describe('edge cases', () => {
    it('returns empty array for invalid ICAO code', async () => {
      const nearby = await getNearbyAirports('INVALID', 30, 10);
      expect(nearby).toEqual([]);
    });

    it('handles lowercase ICAO codes', async () => {
      const nearbyLower = await getNearbyAirports('kfrg', 30, 5);
      const nearbyUpper = await getNearbyAirports('KFRG', 30, 5);

      expect(nearbyLower).toEqual(nearbyUpper);
    });

    it('returns empty array for empty string', async () => {
      const nearby = await getNearbyAirports('', 30, 10);
      expect(nearby).toEqual([]);
    });
  });

  describe('WGS84 distance accuracy', () => {
    it('calculates reasonable distances for known airport pairs', async () => {
      // KJFK is roughly 8-10nm from KFRG
      const nearby = await getNearbyAirports('KFRG', 15, 20);
      const jfk = nearby.find((a) => a.icao === 'KJFK');

      if (jfk) {
        // JFK should be approximately 8-12nm from KFRG
        expect(jfk.distance).toBeGreaterThan(5);
        expect(jfk.distance).toBeLessThan(15);
      }
    });

    it('distances are rounded to one decimal place', async () => {
      const nearby = await getNearbyAirports('KFRG', 30, 10);

      for (const airport of nearby) {
        // Check that distance has at most 1 decimal place
        const rounded = Math.round(airport.distance * 10) / 10;
        expect(airport.distance).toBe(rounded);
      }
    });
  });

  describe('spatial index efficiency', () => {
    it('performs queries quickly (under 100ms)', async () => {
      const start = performance.now();
      await getNearbyAirports('KFRG', 30, 10);
      const elapsed = performance.now() - start;

      // With spatial index, query should be very fast
      expect(elapsed).toBeLessThan(100);
    });

    it('handles multiple sequential queries efficiently', async () => {
      const airports = ['KFRG', 'KJFK', 'KEWR', 'KTEB', 'KCDW'];
      const start = performance.now();

      for (const icao of airports) {
        await getNearbyAirports(icao, 30, 10);
      }

      const elapsed = performance.now() - start;

      // 5 queries should complete in under 500ms total
      expect(elapsed).toBeLessThan(500);
    });
  });
});

describe('NearbyAirport type', () => {
  it('distance is always a positive number', async () => {
    const nearby = await getNearbyAirports('KFRG', 30, 10);

    for (const airport of nearby) {
      expect(airport.distance).toBeGreaterThan(0);
    }
  });

  it('icao codes are uppercase', async () => {
    const nearby = await getNearbyAirports('KFRG', 30, 10);

    for (const airport of nearby) {
      expect(airport.icao).toBe(airport.icao.toUpperCase());
    }
  });
});

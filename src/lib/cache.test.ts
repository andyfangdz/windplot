import { describe, it, expect } from 'vitest';
import { isWindDataStale, getWindDataAgeMs, STALE_THRESHOLD_MS } from './cache';
import { WindData } from './types';

// Helper to create mock wind data with observations at specific timestamps
function createWindData(timestamps: number[]): WindData {
  return {
    icao: 'KFRG',
    name: 'Test Airport',
    observations: timestamps.map((ts, i) => ({
      time: '12:00',
      timestamp: ts,
      wspd: 10,
      wgst: 15,
      wdir: 270,
    })),
  };
}

describe('isWindDataStale', () => {
  const NOW = 1700000000000; // Fixed "now" timestamp for tests

  describe('returns true (stale)', () => {
    it('when windData is null', () => {
      expect(isWindDataStale(null, NOW)).toBe(true);
    });

    it('when windData has no observations', () => {
      const data: WindData = {
        icao: 'KFRG',
        name: 'Test',
        observations: [],
      };
      expect(isWindDataStale(data, NOW)).toBe(true);
    });

    it('when latest observation is older than 70 minutes', () => {
      // Observation from 71 minutes ago
      const oldTimestamp = (NOW - 71 * 60 * 1000) / 1000;
      const data = createWindData([oldTimestamp]);
      expect(isWindDataStale(data, NOW)).toBe(true);
    });

    it('when all observations are older than 70 minutes', () => {
      // Multiple old observations
      const timestamps = [
        (NOW - 120 * 60 * 1000) / 1000, // 2 hours ago
        (NOW - 100 * 60 * 1000) / 1000, // 100 min ago
        (NOW - 80 * 60 * 1000) / 1000, // 80 min ago
      ];
      const data = createWindData(timestamps);
      expect(isWindDataStale(data, NOW)).toBe(true);
    });

    it('at exactly the 70-minute boundary', () => {
      // Observation at exactly 70 minutes + 1ms (just over threshold)
      const boundaryTimestamp = (NOW - STALE_THRESHOLD_MS - 1) / 1000;
      const data = createWindData([boundaryTimestamp]);
      expect(isWindDataStale(data, NOW)).toBe(true);
    });
  });

  describe('returns false (fresh)', () => {
    it('when latest observation is within 70 minutes', () => {
      // Observation from 30 minutes ago
      const recentTimestamp = (NOW - 30 * 60 * 1000) / 1000;
      const data = createWindData([recentTimestamp]);
      expect(isWindDataStale(data, NOW)).toBe(false);
    });

    it('when at least one observation is within 70 minutes', () => {
      // Mix of old and recent observations
      const timestamps = [
        (NOW - 120 * 60 * 1000) / 1000, // 2 hours ago
        (NOW - 30 * 60 * 1000) / 1000, // 30 min ago (fresh!)
        (NOW - 90 * 60 * 1000) / 1000, // 90 min ago
      ];
      const data = createWindData(timestamps);
      expect(isWindDataStale(data, NOW)).toBe(false);
    });

    it('when observation is exactly 70 minutes old', () => {
      // Observation at exactly 70 minutes (at threshold, not over)
      const boundaryTimestamp = (NOW - STALE_THRESHOLD_MS) / 1000;
      const data = createWindData([boundaryTimestamp]);
      expect(isWindDataStale(data, NOW)).toBe(false);
    });

    it('when observation is very recent', () => {
      // Observation from 1 minute ago
      const veryRecentTimestamp = (NOW - 60 * 1000) / 1000;
      const data = createWindData([veryRecentTimestamp]);
      expect(isWindDataStale(data, NOW)).toBe(false);
    });
  });

  describe('uses current time when now parameter is omitted', () => {
    it('returns false for data with recent timestamp', () => {
      // Create data with timestamp 5 minutes ago from actual now
      const fiveMinutesAgo = (Date.now() - 5 * 60 * 1000) / 1000;
      const data = createWindData([fiveMinutesAgo]);
      expect(isWindDataStale(data)).toBe(false);
    });

    it('returns true for data with very old timestamp', () => {
      // Create data with timestamp 2 hours ago from actual now
      const twoHoursAgo = (Date.now() - 2 * 60 * 60 * 1000) / 1000;
      const data = createWindData([twoHoursAgo]);
      expect(isWindDataStale(data)).toBe(true);
    });
  });
});

describe('getWindDataAgeMs', () => {
  const NOW = 1700000000000;

  it('returns null for null windData', () => {
    expect(getWindDataAgeMs(null, NOW)).toBe(null);
  });

  it('returns null for empty observations', () => {
    const data: WindData = {
      icao: 'KFRG',
      name: 'Test',
      observations: [],
    };
    expect(getWindDataAgeMs(data, NOW)).toBe(null);
  });

  it('returns correct age in milliseconds', () => {
    const thirtyMinutesAgo = (NOW - 30 * 60 * 1000) / 1000;
    const data = createWindData([thirtyMinutesAgo]);
    expect(getWindDataAgeMs(data, NOW)).toBe(30 * 60 * 1000);
  });

  it('uses the most recent observation for age calculation', () => {
    const timestamps = [
      (NOW - 60 * 60 * 1000) / 1000, // 60 min ago
      (NOW - 10 * 60 * 1000) / 1000, // 10 min ago (most recent)
      (NOW - 30 * 60 * 1000) / 1000, // 30 min ago
    ];
    const data = createWindData(timestamps);
    expect(getWindDataAgeMs(data, NOW)).toBe(10 * 60 * 1000);
  });
});

describe('STALE_THRESHOLD_MS', () => {
  it('is 70 minutes in milliseconds', () => {
    expect(STALE_THRESHOLD_MS).toBe(70 * 60 * 1000);
    expect(STALE_THRESHOLD_MS).toBe(4200000);
  });
});

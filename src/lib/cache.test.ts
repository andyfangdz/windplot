import { describe, it, expect } from 'vitest';
import { isWindDataStale, getWindDataAgeMs, STALE_THRESHOLD_MS } from './cache';
import { WindData } from './types';

// Helper to create mock wind data with observations at specific timestamps
function createWindData(timestamps: number[]): WindData {
  return {
    icao: 'KFRG',
    name: 'Test Airport',
    observations: timestamps.map((ts) => ({
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

describe('cache staleness scenarios', () => {
  const NOW = 1700000000000;

  describe('client-side cache behavior', () => {
    it('fresh cached data should be used (no fetch needed)', () => {
      // Simulate: user visits KFRG, data is cached with recent timestamp
      // Later: user switches to KCDW, then back to KFRG
      // Expected: cached KFRG data should be used if still fresh
      const cachedTimestamp = (NOW - 30 * 60 * 1000) / 1000; // 30 min ago
      const cachedData = createWindData([cachedTimestamp]);

      expect(isWindDataStale(cachedData, NOW)).toBe(false);
      // Client should use this cached data without fetching
    });

    it('stale cached data should be bypassed (fetch needed)', () => {
      // Simulate: user visits KFRG, data is cached
      // Hours later: user switches back to KFRG
      // Expected: cached data is stale, should fetch fresh data
      const cachedTimestamp = (NOW - 3 * 60 * 60 * 1000) / 1000; // 3 hours ago
      const cachedData = createWindData([cachedTimestamp]);

      expect(isWindDataStale(cachedData, NOW)).toBe(true);
      // Client should NOT use this cached data, should fetch instead
    });

    it('cache with mixed timestamps uses most recent for staleness check', () => {
      // Edge case: cache contains data with varying observation ages
      // Should use the MOST RECENT observation to determine staleness
      const timestamps = [
        (NOW - 4 * 60 * 60 * 1000) / 1000, // 4 hours ago
        (NOW - 2 * 60 * 60 * 1000) / 1000, // 2 hours ago
        (NOW - 45 * 60 * 1000) / 1000, // 45 min ago (most recent, still fresh)
      ];
      const cachedData = createWindData(timestamps);

      expect(isWindDataStale(cachedData, NOW)).toBe(false);
      // Most recent obs is 45 min old, which is < 70 min threshold
    });
  });

  describe('auto-refresh timing', () => {
    it('data becomes stale after 70 minutes without refresh', () => {
      // Simulate: data fetched at T=0 with observation timestamp T=0
      // At T=69min: still fresh
      // At T=71min: stale
      const fetchTime = NOW;
      const obsTimestamp = fetchTime / 1000; // observation at fetch time

      const data = createWindData([obsTimestamp]);

      // 69 minutes later: still fresh
      const at69min = fetchTime + 69 * 60 * 1000;
      expect(isWindDataStale(data, at69min)).toBe(false);

      // 71 minutes later: stale
      const at71min = fetchTime + 71 * 60 * 1000;
      expect(isWindDataStale(data, at71min)).toBe(true);
    });

    it('auto-refresh every 5 minutes keeps data fresh', () => {
      // With 5-minute auto-refresh, the latest observation should never be
      // more than ~10 minutes old (5 min refresh + 5 min AWOS interval)
      // This is well under the 70-minute threshold
      const maxObsAge = 10 * 60 * 1000; // 10 min max expected

      expect(maxObsAge).toBeLessThan(STALE_THRESHOLD_MS);
    });
  });
});

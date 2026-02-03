import { WindData } from './types';

// Stale threshold: 70 minutes in milliseconds
export const STALE_THRESHOLD_MS = 70 * 60 * 1000;

/**
 * Check if wind data is stale (older than 70 minutes).
 * Returns true if data is null, has no observations, or the latest observation
 * is older than the stale threshold.
 */
export function isWindDataStale(
  windData: WindData | null,
  now: number = Date.now()
): boolean {
  if (!windData?.observations?.length) return true;
  const latestTimestamp = Math.max(
    ...windData.observations.map((o) => o.timestamp)
  );
  return now - latestTimestamp * 1000 > STALE_THRESHOLD_MS;
}

/**
 * Get the age of wind data in milliseconds.
 * Returns null if data is null or has no observations.
 */
export function getWindDataAgeMs(
  windData: WindData | null,
  now: number = Date.now()
): number | null {
  if (!windData?.observations?.length) return null;
  const latestTimestamp = Math.max(
    ...windData.observations.map((o) => o.timestamp)
  );
  return now - latestTimestamp * 1000;
}

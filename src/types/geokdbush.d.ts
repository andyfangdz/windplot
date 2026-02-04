declare module 'geokdbush' {
  import type KDBush from 'kdbush';

  /**
   * Returns an array of indices of points from the index within the given
   * maximum distance from a query point, sorted by distance (nearest first).
   *
   * @param index - A KDBush index
   * @param lon - Query longitude
   * @param lat - Query latitude
   * @param maxResults - Maximum number of results to return (default: Infinity)
   * @param maxDistance - Maximum distance in kilometers (default: Infinity)
   * @param filterFn - Optional filter function
   * @returns Array of indices into the original points array
   */
  export function around(
    index: KDBush,
    lon: number,
    lat: number,
    maxResults?: number,
    maxDistance?: number,
    filterFn?: (idx: number) => boolean
  ): number[];

  /**
   * Returns the distance in kilometers between two geographical points.
   *
   * @param lon1 - First point longitude
   * @param lat1 - First point latitude
   * @param lon2 - Second point longitude
   * @param lat2 - Second point latitude
   * @returns Distance in kilometers
   */
  export function distance(
    lon1: number,
    lat1: number,
    lon2: number,
    lat2: number
  ): number;
}

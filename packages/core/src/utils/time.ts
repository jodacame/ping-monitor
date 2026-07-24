/**
 * Time helpers. Kept pure and dependency-free so they are trivial to test and
 * safe to use in hot scheduling paths.
 */

/** Milliseconds in one second. */
export const SECOND_MS = 1000;

/**
 * Compute the next check timestamp from a reference instant and an interval.
 *
 * @param from      Reference instant (defaults to now).
 * @param intervalSeconds Check interval in seconds.
 */
export function nextCheckAt(intervalSeconds: number, from: Date = new Date()): Date {
  return new Date(from.getTime() + intervalSeconds * SECOND_MS);
}

/** Clamp a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

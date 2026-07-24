/** UTC time-bucket helpers for rollup aggregation. */

/** Truncate an instant to the start of its UTC hour. */
export function truncateToHourUtc(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours()),
  );
}

/** Truncate an instant to the start of its UTC day. */
export function truncateToDayUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

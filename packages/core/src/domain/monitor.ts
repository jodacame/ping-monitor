/**
 * Monitor domain vocabulary.
 *
 * These are the canonical, transport-agnostic representations used across the
 * whole system. Compact numeric encodings for the database live in `@ping/db`;
 * this module only deals with human-readable string enums.
 */

/** The kind of probe a monitor performs. */
export const MonitorType = {
  Http: 'http',
  Tcp: 'tcp',
  Icmp: 'icmp',
} as const;
export type MonitorType = (typeof MonitorType)[keyof typeof MonitorType];

/** Publicly observable status of a monitor. */
export const MonitorStatus = {
  /** Not yet checked; awaiting first result. */
  Pending: 'pending',
  Up: 'up',
  Down: 'down',
  /** Explicitly disabled by the user; not scheduled. */
  Paused: 'paused',
} as const;
export type MonitorStatus = (typeof MonitorStatus)[keyof typeof MonitorStatus];

/**
 * Allowed check intervals, in seconds. Constrained on purpose: a small, fixed
 * set keeps scheduling buckets predictable and the UI simple.
 */
export const CHECK_INTERVALS_SECONDS = [30, 60, 300, 900] as const;
export type CheckIntervalSeconds = (typeof CHECK_INTERVALS_SECONDS)[number];

/** Type guard for the supported check intervals. */
export function isCheckInterval(value: number): value is CheckIntervalSeconds {
  return (CHECK_INTERVALS_SECONDS as readonly number[]).includes(value);
}

/** Sensible upper bound for consecutive-failure retry thresholds. */
export const MAX_RETRY_THRESHOLD = 10;

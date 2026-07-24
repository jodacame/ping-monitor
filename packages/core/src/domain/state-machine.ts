import { MonitorStatus } from './monitor.js';

/**
 * Monitor health state machine.
 *
 * This is the anti-false-positive core of the product: a monitor only flips to
 * DOWN after `failureThreshold` *consecutive* failures, and only back to UP
 * after `recoveryThreshold` consecutive successes. The function is pure so it
 * can be unit-tested exhaustively and reused by any worker.
 */

/** Rolling health counters persisted per monitor. */
export interface MonitorHealth {
  readonly status: MonitorStatus;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
}

/** How many consecutive results are required to change state. */
export interface RetryPolicy {
  /** Consecutive failures required to flip to DOWN. Must be >= 1. */
  readonly failureThreshold: number;
  /** Consecutive successes required to flip to UP. Must be >= 1. */
  readonly recoveryThreshold: number;
}

/** A public status change that should emit a domain event. */
export interface StatusTransition {
  readonly from: MonitorStatus;
  readonly to: MonitorStatus;
}

/** Result of folding one check outcome into the current health. */
export interface HealthEvaluation {
  readonly health: MonitorHealth;
  /** Non-null only when the publicly observable status changed. */
  readonly transition: StatusTransition | null;
}

/** The initial health of a freshly created monitor. */
export function initialHealth(): MonitorHealth {
  return { status: MonitorStatus.Pending, consecutiveFailures: 0, consecutiveSuccesses: 0 };
}

/**
 * Fold a single check result (`up`) into the current health using the retry
 * policy, returning the next health and any resulting status transition.
 *
 * Paused monitors are never scheduled, so this function assumes an active
 * monitor and will move a `Paused`/`Pending` status to `Up`/`Down` as soon as
 * the corresponding threshold is met.
 */
export function evaluateHealth(
  current: MonitorHealth,
  up: boolean,
  policy: RetryPolicy,
): HealthEvaluation {
  const failureThreshold = Math.max(1, policy.failureThreshold);
  const recoveryThreshold = Math.max(1, policy.recoveryThreshold);

  if (up) {
    const consecutiveSuccesses = current.consecutiveSuccesses + 1;
    const next: MonitorHealth = {
      status: current.status,
      consecutiveFailures: 0,
      consecutiveSuccesses,
    };
    if (current.status !== MonitorStatus.Up && consecutiveSuccesses >= recoveryThreshold) {
      return {
        health: { ...next, status: MonitorStatus.Up },
        transition: { from: current.status, to: MonitorStatus.Up },
      };
    }
    return { health: next, transition: null };
  }

  const consecutiveFailures = current.consecutiveFailures + 1;
  const next: MonitorHealth = {
    status: current.status,
    consecutiveFailures,
    consecutiveSuccesses: 0,
  };
  if (current.status !== MonitorStatus.Down && consecutiveFailures >= failureThreshold) {
    return {
      health: { ...next, status: MonitorStatus.Down },
      transition: { from: current.status, to: MonitorStatus.Down },
    };
  }
  return { health: next, transition: null };
}

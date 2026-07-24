import { describe, expect, it } from 'vitest';
import {
  MonitorStatus,
  evaluateHealth,
  initialHealth,
  type MonitorHealth,
  type RetryPolicy,
} from '../src/index.js';

const policy = (failureThreshold: number, recoveryThreshold = 1): RetryPolicy => ({
  failureThreshold,
  recoveryThreshold,
});

/** Fold a sequence of up/down results through the state machine. */
function run(start: MonitorHealth, results: boolean[], p: RetryPolicy): MonitorHealth {
  return results.reduce((health, up) => evaluateHealth(health, up, p).health, start);
}

describe('evaluateHealth', () => {
  it('starts pending and does not flip to UP until recovery threshold is met', () => {
    const p = policy(3, 2);
    const first = evaluateHealth(initialHealth(), true, p);
    expect(first.health.status).toBe(MonitorStatus.Pending);
    expect(first.transition).toBeNull();

    const second = evaluateHealth(first.health, true, p);
    expect(second.health.status).toBe(MonitorStatus.Up);
    expect(second.transition).toEqual({ from: MonitorStatus.Pending, to: MonitorStatus.Up });
  });

  it('does not flip to DOWN before the failure threshold (avoids false positives)', () => {
    const p = policy(3);
    let health = run(initialHealth(), [true], p); // -> up
    expect(health.status).toBe(MonitorStatus.Up);

    // Two failures: still UP.
    health = run(health, [false, false], p);
    expect(health.status).toBe(MonitorStatus.Up);
    expect(health.consecutiveFailures).toBe(2);

    // Third consecutive failure: now DOWN.
    const evalDown = evaluateHealth(health, false, p);
    expect(evalDown.health.status).toBe(MonitorStatus.Down);
    expect(evalDown.transition).toEqual({ from: MonitorStatus.Up, to: MonitorStatus.Down });
  });

  it('resets the failure streak on any success', () => {
    const p = policy(3);
    let health = run(initialHealth(), [true, false, false], p);
    expect(health.consecutiveFailures).toBe(2);
    health = evaluateHealth(health, true, p).health;
    expect(health.consecutiveFailures).toBe(0);
    expect(health.consecutiveSuccesses).toBe(1);
    expect(health.status).toBe(MonitorStatus.Up);
  });

  it('recovers from DOWN to UP only after recovery threshold consecutive successes', () => {
    const p = policy(1, 3);
    let health = evaluateHealth(initialHealth(), false, p).health; // -> down
    expect(health.status).toBe(MonitorStatus.Down);

    health = run(health, [true, true], p);
    expect(health.status).toBe(MonitorStatus.Down); // not enough successes yet

    const recovered = evaluateHealth(health, true, p);
    expect(recovered.health.status).toBe(MonitorStatus.Up);
    expect(recovered.transition).toEqual({ from: MonitorStatus.Down, to: MonitorStatus.Up });
  });

  it('emits no transition while status is unchanged', () => {
    const p = policy(2);
    const health = run(initialHealth(), [true, true, true], p);
    const next = evaluateHealth(health, true, p);
    expect(next.transition).toBeNull();
    expect(next.health.consecutiveSuccesses).toBe(4);
  });

  it('treats thresholds below 1 as 1 (defensive)', () => {
    const p: RetryPolicy = { failureThreshold: 0, recoveryThreshold: 0 };
    const down = evaluateHealth(initialHealth(), false, p);
    expect(down.health.status).toBe(MonitorStatus.Down);
  });
});

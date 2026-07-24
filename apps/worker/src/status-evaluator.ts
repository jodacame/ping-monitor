import {
  type CheckError,
  MonitorStatus,
  evaluateHealth,
  newId,
} from '@ping/core';
import { type Database, HealthRepository, encodeErrorKind } from '@ping/db';

/**
 * Applies a single check outcome to a monitor's health and derives the overall
 * (quorum-based) status, all within one serialized transaction per assignment.
 *
 * Two levels of decision:
 *   1. Per region: the retry state machine (`evaluateHealth`) decides if this
 *      region flips UP/DOWN.
 *   2. Overall: the monitor is DOWN when at least `quorum` regions are down,
 *      UP when regions report but the quorum isn't met, PENDING before any
 *      region has a definitive result.
 *
 * On an overall transition it opens/resolves the incident and returns a
 * `StatusChange` for the caller to publish on the event bus.
 */

export interface CheckSignal {
  readonly monitorId: string;
  readonly regionId: number;
  readonly up: boolean;
  readonly responseMs: number | null;
  readonly checkedAt: Date;
  readonly error?: CheckError;
}

export interface StatusChange {
  readonly from: MonitorStatus;
  readonly to: MonitorStatus;
  readonly monitorPublicId: string;
  readonly monitorName: string;
  readonly workspacePublicId: string;
  readonly at: Date;
  readonly responseMs: number | null;
  readonly error?: CheckError;
}

export class StatusEvaluator {
  constructor(private readonly db: Database) {}

  async evaluate(signal: CheckSignal): Promise<StatusChange | null> {
    return this.db.transaction(async (tx) => {
      const health = new HealthRepository(tx);
      const ctx = await health.lockAssignmentContext(signal.monitorId, signal.regionId);
      if (!ctx) return null; // assignment was removed concurrently

      // 1. Region-level retry state machine.
      const evaluation = evaluateHealth(
        {
          status: ctx.regionStatus,
          consecutiveFailures: ctx.consecutiveFailures,
          consecutiveSuccesses: ctx.consecutiveSuccesses,
        },
        signal.up,
        { failureThreshold: ctx.failureThreshold, recoveryThreshold: ctx.recoveryThreshold },
      );
      await health.updateAssignmentHealth(
        signal.monitorId,
        signal.regionId,
        evaluation.health.status,
        evaluation.health.consecutiveFailures,
        evaluation.health.consecutiveSuccesses,
        signal.checkedAt,
        signal.responseMs,
      );

      // 2. Overall quorum decision (includes the region just updated).
      const tally = await health.tallyRegions(signal.monitorId);
      const overall =
        tally.reporting === 0
          ? MonitorStatus.Pending
          : tally.down >= ctx.quorum
            ? MonitorStatus.Down
            : MonitorStatus.Up;

      const changed = overall !== ctx.overallStatus;
      await health.updateMonitorAfterCheck(
        signal.monitorId,
        overall,
        changed,
        signal.checkedAt,
        signal.responseMs,
      );

      if (!changed) return null;

      if (overall === MonitorStatus.Down) {
        await health.openIncident(
          signal.monitorId,
          newId(),
          signal.checkedAt,
          signal.error ? encodeErrorKind(signal.error.kind) : null,
          signal.error?.message ?? null,
        );
      } else if (ctx.overallStatus === MonitorStatus.Down) {
        await health.resolveOpenIncident(signal.monitorId, signal.checkedAt);
      }

      return {
        from: ctx.overallStatus,
        to: overall,
        monitorPublicId: ctx.monitorPublicId,
        monitorName: ctx.monitorName,
        workspacePublicId: ctx.workspacePublicId,
        at: signal.checkedAt,
        responseMs: signal.responseMs,
        ...(signal.error ? { error: signal.error } : {}),
      };
    });
  }
}

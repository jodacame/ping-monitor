import { MonitorStatus } from '@ping/core';
import type { Queryable } from '../pool.js';
import { decodeMonitorStatus, encodeMonitorStatus } from '../codecs.js';

/**
 * Primitive operations behind the worker's status-evaluation transaction.
 *
 * The domain decision (does this outcome flip the region? does the quorum flip
 * the monitor?) lives in `@ping/core` and the worker's application service; this
 * repository only provides the locked reads and writes it composes. Keeping the
 * policy out of SQL keeps both independently testable.
 */

export interface AssignmentContext {
  readonly regionStatus: MonitorStatus;
  readonly consecutiveFailures: number;
  readonly consecutiveSuccesses: number;
  readonly failureThreshold: number;
  readonly recoveryThreshold: number;
  readonly quorum: number;
  readonly overallStatus: MonitorStatus;
  readonly monitorPublicId: string;
  readonly monitorName: string;
  readonly workspacePublicId: string;
}

export interface RegionTally {
  readonly down: number;
  readonly reporting: number;
}

export class HealthRepository {
  constructor(private readonly db: Queryable) {}

  /** Lock the assignment row and read it alongside the monitor's policy. */
  async lockAssignmentContext(
    monitorId: string,
    regionId: number,
  ): Promise<AssignmentContext | null> {
    const res = await this.db.query<{
      region_status: number;
      consecutive_failures: number;
      consecutive_successes: number;
      failure_threshold: number;
      recovery_threshold: number;
      quorum: number;
      overall_status: number;
      monitor_public_id: string;
      monitor_name: string;
      workspace_public_id: string;
    }>(
      `SELECT a.status AS region_status, a.consecutive_failures, a.consecutive_successes,
              m.failure_threshold, m.recovery_threshold, m.quorum,
              m.status AS overall_status, m.public_id AS monitor_public_id,
              m.name AS monitor_name, w.public_id AS workspace_public_id
       FROM monitor_assignments a
       JOIN monitors m ON m.id = a.monitor_id
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE a.monitor_id = $1 AND a.region_id = $2
       FOR UPDATE OF a`,
      [monitorId, regionId],
    );
    const row = res.rows[0];
    if (!row) return null;
    return {
      regionStatus: decodeMonitorStatus(row.region_status),
      consecutiveFailures: row.consecutive_failures,
      consecutiveSuccesses: row.consecutive_successes,
      failureThreshold: row.failure_threshold,
      recoveryThreshold: row.recovery_threshold,
      quorum: row.quorum,
      overallStatus: decodeMonitorStatus(row.overall_status),
      monitorPublicId: row.monitor_public_id,
      monitorName: row.monitor_name,
      workspacePublicId: row.workspace_public_id,
    };
  }

  async updateAssignmentHealth(
    monitorId: string,
    regionId: number,
    status: MonitorStatus,
    consecutiveFailures: number,
    consecutiveSuccesses: number,
    checkedAt: Date,
    responseMs: number | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE monitor_assignments
       SET status = $3, consecutive_failures = $4, consecutive_successes = $5,
           last_checked_at = $6, last_response_ms = $7
       WHERE monitor_id = $1 AND region_id = $2`,
      [
        monitorId,
        regionId,
        encodeMonitorStatus(status),
        consecutiveFailures,
        consecutiveSuccesses,
        checkedAt,
        responseMs,
      ],
    );
  }

  /** Count enabled regions that are down, and that have reported a definitive result. */
  async tallyRegions(monitorId: string): Promise<RegionTally> {
    const res = await this.db.query<{ down: string; reporting: string }>(
      `SELECT
         count(*) FILTER (WHERE enabled AND status = $2)::text AS down,
         count(*) FILTER (WHERE enabled AND status IN ($2, $3))::text AS reporting
       FROM monitor_assignments WHERE monitor_id = $1`,
      [monitorId, encodeMonitorStatus(MonitorStatus.Down), encodeMonitorStatus(MonitorStatus.Up)],
    );
    const row = res.rows[0]!;
    return { down: Number(row.down), reporting: Number(row.reporting) };
  }

  /** Update the monitor's most-recent-check fields, and status on transition. */
  async updateMonitorAfterCheck(
    monitorId: string,
    overallStatus: MonitorStatus,
    changed: boolean,
    checkedAt: Date,
    responseMs: number | null,
  ): Promise<void> {
    await this.db.query(
      `UPDATE monitors
       SET last_checked_at = $2,
           last_response_ms = $3,
           status = $4,
           last_status_changed_at = CASE WHEN $5 THEN $2 ELSE last_status_changed_at END
       WHERE id = $1`,
      [monitorId, checkedAt, responseMs, encodeMonitorStatus(overallStatus), changed],
    );
  }

  /** Open an incident unless one is already open for this monitor. */
  async openIncident(
    monitorId: string,
    publicId: string,
    startedAt: Date,
    cause: number | null,
    causeMessage: string | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO incidents (public_id, monitor_id, started_at, cause, cause_message)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (monitor_id) WHERE resolved_at IS NULL DO NOTHING`,
      [publicId, monitorId, startedAt, cause, causeMessage],
    );
  }

  /** Resolve the currently-open incident (if any) and stamp its duration. */
  async resolveOpenIncident(monitorId: string, resolvedAt: Date): Promise<void> {
    await this.db.query(
      `UPDATE incidents
       SET resolved_at = $2,
           duration_seconds = GREATEST(0, EXTRACT(EPOCH FROM ($2 - started_at))::int)
       WHERE monitor_id = $1 AND resolved_at IS NULL`,
      [monitorId, resolvedAt],
    );
  }
}

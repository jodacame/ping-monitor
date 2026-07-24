import type { MonitorType } from '@ping/core';
import type { Queryable } from '../pool.js';
import { decodeMonitorType } from '../codecs.js';

/**
 * Scheduling and partition maintenance.
 *
 * `claimDue` is the scheduler's hot path: it atomically selects due
 * (monitor, region) assignments, reschedules their `next_check_at`, and returns
 * everything a worker needs to run the check — all in one statement using
 * `FOR UPDATE SKIP LOCKED`, so multiple scheduler replicas never hand out the
 * same assignment twice.
 */

export interface DueCheck {
  readonly monitorId: string;
  readonly regionId: number;
  readonly type: MonitorType;
  readonly target: string;
  readonly config: Record<string, unknown>;
  readonly timeoutMs: number;
}

interface DueRow {
  monitor_id: string;
  region_id: number;
  type: number;
  target: string;
  config: Record<string, unknown>;
  timeout_ms: number;
}

export class SchedulingRepository {
  constructor(private readonly db: Queryable) {}

  /**
   * Claim up to `limit` due assignments and advance their next_check_at by each
   * monitor's interval. Returns the claimed checks (possibly fewer than limit).
   */
  async claimDue(limit: number): Promise<DueCheck[]> {
    const res = await this.db.query<DueRow>(
      `WITH due AS (
         SELECT a.monitor_id, a.region_id
         FROM monitor_assignments a
         WHERE a.enabled AND a.next_check_at <= now()
         ORDER BY a.next_check_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED
       )
       UPDATE monitor_assignments a
       SET next_check_at = now() + make_interval(secs => m.interval_seconds)
       FROM due d
       JOIN monitors m ON m.id = d.monitor_id
       WHERE a.monitor_id = d.monitor_id AND a.region_id = d.region_id
       RETURNING a.monitor_id, a.region_id, m.type, m.target, m.config, m.timeout_ms`,
      [limit],
    );
    return res.rows.map((row) => ({
      monitorId: row.monitor_id,
      regionId: row.region_id,
      type: decodeMonitorType(row.type),
      target: row.target,
      config: row.config,
      timeoutMs: row.timeout_ms,
    }));
  }

  /** Ensure daily partitions exist for today .. today + daysAhead (UTC). */
  async ensurePartitions(daysAhead: number): Promise<void> {
    await this.db.query('SELECT ensure_check_partitions($1)', [daysAhead]);
  }

  /**
   * Drop raw check_results partitions strictly older than `retentionDays`.
   * Returns the dropped partition names.
   */
  async dropOldPartitions(retentionDays: number): Promise<string[]> {
    const res = await this.db.query<{ drop_check_partitions_before: string }>(
      `SELECT drop_check_partitions_before(((now() AT TIME ZONE 'UTC')::date - $1::int))`,
      [retentionDays],
    );
    return res.rows.map((r) => r.drop_check_partitions_before);
  }
}

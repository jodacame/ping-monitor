import { CheckErrorKind, MonitorStatus } from '@ping/core';
import type { Queryable } from '../pool.js';
import { decodeErrorKind, encodeMonitorStatus } from '../codecs.js';

/** Read path: aggregated statistics for dashboards, charts and monitor detail. */

export interface WorkspaceOverview {
  readonly total: number;
  readonly up: number;
  readonly down: number;
  readonly paused: number;
  readonly pending: number;
}

export interface MonitorSummary {
  readonly checksTotal: number;
  readonly checksUp: number;
  /** Uptime ratio in [0, 1], or null when there are no checks in the window. */
  readonly uptime: number | null;
  readonly avgLatencyMs: number | null;
  readonly minLatencyMs: number | null;
  readonly maxLatencyMs: number | null;
}

export interface SeriesPoint {
  readonly bucket: Date;
  readonly checksTotal: number;
  readonly checksUp: number;
  readonly uptime: number | null;
  readonly avgLatencyMs: number | null;
  readonly minLatencyMs: number | null;
  readonly maxLatencyMs: number | null;
}

export interface RecentCheck {
  readonly regionId: number;
  readonly checkedAt: Date;
  readonly up: boolean;
  readonly responseMs: number | null;
  readonly statusCode: number | null;
  readonly errorKind: CheckErrorKind | null;
}

export interface IncidentSummary {
  readonly publicId: string;
  readonly startedAt: Date;
  readonly resolvedAt: Date | null;
  readonly durationSeconds: number | null;
  readonly causeMessage: string | null;
}

export type SeriesGranularity = 'hour' | 'day';

interface RollupAggRow {
  total: string;
  up: string;
  lat_sum: string;
  lat_count: string;
  lat_min: number | null;
  lat_max: number | null;
}

function ratio(up: number, total: number): number | null {
  return total > 0 ? up / total : null;
}

function avg(sum: number, count: number): number | null {
  return count > 0 ? Math.round(sum / count) : null;
}

export class StatsRepository {
  constructor(private readonly db: Queryable) {}

  /** Status breakdown for a whole workspace (drives the dashboard header). */
  async workspaceOverview(workspaceId: string): Promise<WorkspaceOverview> {
    const res = await this.db.query<{
      total: string;
      up: string;
      down: string;
      paused: string;
      pending: string;
    }>(
      `SELECT
         count(*)::text AS total,
         count(*) FILTER (WHERE status = $2)::text AS up,
         count(*) FILTER (WHERE status = $3)::text AS down,
         count(*) FILTER (WHERE status = $4)::text AS paused,
         count(*) FILTER (WHERE status = $5)::text AS pending
       FROM monitors WHERE workspace_id = $1`,
      [
        workspaceId,
        encodeMonitorStatus(MonitorStatus.Up),
        encodeMonitorStatus(MonitorStatus.Down),
        encodeMonitorStatus(MonitorStatus.Paused),
        encodeMonitorStatus(MonitorStatus.Pending),
      ],
    );
    const r = res.rows[0]!;
    return {
      total: Number(r.total),
      up: Number(r.up),
      down: Number(r.down),
      paused: Number(r.paused),
      pending: Number(r.pending),
    };
  }

  /** Aggregate statistics for a monitor since `since` (across all regions). */
  async monitorSummary(monitorId: string, since: Date): Promise<MonitorSummary> {
    const res = await this.db.query<RollupAggRow>(
      `SELECT
         coalesce(sum(checks_total), 0)::text AS total,
         coalesce(sum(checks_up), 0)::text AS up,
         coalesce(sum(latency_sum), 0)::text AS lat_sum,
         coalesce(sum(latency_count), 0)::text AS lat_count,
         min(latency_min) AS lat_min,
         max(latency_max) AS lat_max
       FROM monitor_stats_hourly
       WHERE monitor_id = $1 AND bucket >= $2`,
      [monitorId, since],
    );
    const r = res.rows[0]!;
    const total = Number(r.total);
    const up = Number(r.up);
    return {
      checksTotal: total,
      checksUp: up,
      uptime: ratio(up, total),
      avgLatencyMs: avg(Number(r.lat_sum), Number(r.lat_count)),
      minLatencyMs: r.lat_min,
      maxLatencyMs: r.lat_max,
    };
  }

  /**
   * Time-series for latency/uptime charts. Reads hourly rollups for `hour`
   * granularity (24h view) and daily rollups for `day` (7d/30d views).
   */
  async series(
    monitorId: string,
    from: Date,
    to: Date,
    granularity: SeriesGranularity,
  ): Promise<SeriesPoint[]> {
    const table = granularity === 'hour' ? 'monitor_stats_hourly' : 'monitor_stats_daily';
    const res = await this.db.query<RollupAggRow & { bucket: Date }>(
      `SELECT bucket,
              sum(checks_total)::text AS total,
              sum(checks_up)::text AS up,
              sum(latency_sum)::text AS lat_sum,
              sum(latency_count)::text AS lat_count,
              min(latency_min) AS lat_min,
              max(latency_max) AS lat_max
       FROM ${table}
       WHERE monitor_id = $1 AND bucket >= $2 AND bucket < $3
       GROUP BY bucket
       ORDER BY bucket`,
      [monitorId, from, to],
    );
    return res.rows.map((r) => {
      const total = Number(r.total);
      const up = Number(r.up);
      return {
        bucket: r.bucket,
        checksTotal: total,
        checksUp: up,
        uptime: ratio(up, total),
        avgLatencyMs: avg(Number(r.lat_sum), Number(r.lat_count)),
        minLatencyMs: r.lat_min,
        maxLatencyMs: r.lat_max,
      };
    });
  }

  async recentChecks(monitorId: string, limit: number): Promise<RecentCheck[]> {
    const res = await this.db.query<{
      region_id: number;
      checked_at: Date;
      up: boolean;
      response_ms: number | null;
      status_code: number | null;
      error_kind: number | null;
    }>(
      `SELECT region_id, checked_at, up, response_ms, status_code, error_kind
       FROM check_results
       WHERE monitor_id = $1
       ORDER BY checked_at DESC
       LIMIT $2`,
      [monitorId, limit],
    );
    return res.rows.map((r) => ({
      regionId: r.region_id,
      checkedAt: r.checked_at,
      up: r.up,
      responseMs: r.response_ms,
      statusCode: r.status_code,
      errorKind: decodeErrorKind(r.error_kind),
    }));
  }

  async listIncidents(monitorId: string, limit: number): Promise<IncidentSummary[]> {
    const res = await this.db.query<{
      public_id: string;
      started_at: Date;
      resolved_at: Date | null;
      duration_seconds: number | null;
      cause_message: string | null;
    }>(
      `SELECT public_id, started_at, resolved_at, duration_seconds, cause_message
       FROM incidents
       WHERE monitor_id = $1
       ORDER BY started_at DESC
       LIMIT $2`,
      [monitorId, limit],
    );
    return res.rows.map((r) => ({
      publicId: r.public_id,
      startedAt: r.started_at,
      resolvedAt: r.resolved_at,
      durationSeconds: r.duration_seconds,
      causeMessage: r.cause_message,
    }));
  }
}

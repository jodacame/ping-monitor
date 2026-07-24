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

/** Compact per-monitor stats for the list view (uptime + heartbeat bars). */
export interface MonitorMiniStats {
  /** 24h uptime ratio in [0,1], or null when no checks. */
  readonly uptime24h: number | null;
  /** Up-ratio per recent hourly bucket, oldest→newest (null = no data). */
  readonly bars: Array<number | null>;
}

/** Workspace-wide 24h insights for the dashboard side panel. */
export interface WorkspaceInsights {
  readonly uptime: number | null;
  readonly avgLatencyMs: number | null;
  readonly incidents24h: number;
}

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

  /**
   * Compact stats for a set of monitors (list view): 24h uptime and the last
   * ~30 hourly up-ratios for a heartbeat bar. Two bounded, indexed queries.
   */
  async miniStats(monitorIds: string[], bars = 30): Promise<Map<string, MonitorMiniStats>> {
    const out = new Map<string, MonitorMiniStats>();
    if (monitorIds.length === 0) return out;

    const uptimeRes = await this.db.query<{ monitor_id: string; uptime: number | null }>(
      `SELECT monitor_id,
              sum(checks_up)::float / NULLIF(sum(checks_total), 0) AS uptime
       FROM monitor_stats_hourly
       WHERE monitor_id = ANY($1::bigint[]) AND bucket >= now() - interval '24 hours'
       GROUP BY monitor_id`,
      [monitorIds],
    );
    const uptimeMap = new Map(uptimeRes.rows.map((r) => [r.monitor_id, r.uptime]));

    const barsRes = await this.db.query<{ monitor_id: string; ratio: number | null }>(
      `SELECT monitor_id, ratio FROM (
         SELECT monitor_id, bucket,
                sum(checks_up)::float / NULLIF(sum(checks_total), 0) AS ratio,
                row_number() OVER (PARTITION BY monitor_id ORDER BY bucket DESC) AS rn
         FROM monitor_stats_hourly
         WHERE monitor_id = ANY($1::bigint[]) AND bucket >= now() - interval '72 hours'
         GROUP BY monitor_id, bucket
       ) t
       WHERE rn <= $2
       ORDER BY monitor_id, bucket ASC`,
      [monitorIds, bars],
    );
    const barsMap = new Map<string, Array<number | null>>();
    for (const row of barsRes.rows) {
      const arr = barsMap.get(row.monitor_id) ?? [];
      arr.push(row.ratio === null ? null : Number(row.ratio));
      barsMap.set(row.monitor_id, arr);
    }

    for (const id of monitorIds) {
      const uptime = uptimeMap.get(id);
      out.set(id, {
        uptime24h: uptime === undefined || uptime === null ? null : Number(uptime),
        bars: barsMap.get(id) ?? [],
      });
    }
    return out;
  }

  /** Workspace-wide 24h uptime, average latency and incident count. */
  async workspaceInsights(workspaceId: string): Promise<WorkspaceInsights> {
    const agg = await this.db.query<{
      uptime: number | null;
      lat_sum: string | null;
      lat_count: string | null;
    }>(
      `SELECT sum(h.checks_up)::float / NULLIF(sum(h.checks_total), 0) AS uptime,
              sum(h.latency_sum)::text AS lat_sum,
              sum(h.latency_count)::text AS lat_count
       FROM monitor_stats_hourly h
       JOIN monitors m ON m.id = h.monitor_id
       WHERE m.workspace_id = $1 AND h.bucket >= now() - interval '24 hours'`,
      [workspaceId],
    );
    const inc = await this.db.query<{ c: number }>(
      `SELECT count(*)::int AS c
       FROM incidents i
       JOIN monitors m ON m.id = i.monitor_id
       WHERE m.workspace_id = $1 AND i.started_at >= now() - interval '24 hours'`,
      [workspaceId],
    );
    const row = agg.rows[0]!;
    return {
      uptime: row.uptime === null ? null : Number(row.uptime),
      avgLatencyMs: avg(Number(row.lat_sum ?? 0), Number(row.lat_count ?? 0)),
      incidents24h: inc.rows[0]?.c ?? 0,
    };
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

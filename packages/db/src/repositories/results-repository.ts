import type { Queryable } from '../pool.js';

/**
 * Write path for time-series data.
 *
 * Raw results are inserted in batches; rollups are upserted as pre-aggregated
 * deltas (the worker accumulates per (monitor, region, bucket) in memory and
 * flushes periodically), so a monitor checked every 30s costs one incremental
 * upsert per flush rather than a row-modify per check. `unnest` keeps each flush
 * to a single round-trip regardless of batch size.
 */

export interface CheckResultRow {
  readonly monitorId: string;
  readonly regionId: number;
  readonly checkedAt: Date;
  readonly up: boolean;
  readonly responseMs: number | null;
  readonly statusCode: number | null;
  readonly errorKind: number | null;
}

export interface RollupDelta {
  readonly monitorId: string;
  readonly regionId: number;
  /** Hour-truncated (hourly) or date (daily) bucket. */
  readonly bucket: Date;
  readonly checksTotal: number;
  readonly checksUp: number;
  readonly latencySum: number;
  readonly latencyCount: number;
  readonly latencyMin: number | null;
  readonly latencyMax: number | null;
}

export class ResultsRepository {
  constructor(private readonly db: Queryable) {}

  /** Batch-insert raw check results. */
  async insertResults(rows: readonly CheckResultRow[]): Promise<void> {
    if (rows.length === 0) return;
    await this.db.query(
      `INSERT INTO check_results
         (monitor_id, region_id, checked_at, up, response_ms, status_code, error_kind)
       SELECT * FROM unnest(
         $1::bigint[], $2::smallint[], $3::timestamptz[], $4::boolean[],
         $5::int[], $6::smallint[], $7::smallint[]
       )`,
      [
        rows.map((r) => r.monitorId),
        rows.map((r) => r.regionId),
        rows.map((r) => r.checkedAt),
        rows.map((r) => r.up),
        rows.map((r) => r.responseMs),
        rows.map((r) => r.statusCode),
        rows.map((r) => r.errorKind),
      ],
    );
  }

  async upsertHourly(deltas: readonly RollupDelta[]): Promise<void> {
    await this.upsertRollup('monitor_stats_hourly', deltas);
  }

  async upsertDaily(deltas: readonly RollupDelta[]): Promise<void> {
    await this.upsertRollup('monitor_stats_daily', deltas);
  }

  private async upsertRollup(
    table: 'monitor_stats_hourly' | 'monitor_stats_daily',
    deltas: readonly RollupDelta[],
  ): Promise<void> {
    if (deltas.length === 0) return;
    // LEAST/GREATEST ignore NULLs, so min/max merge correctly across flushes.
    await this.db.query(
      `INSERT INTO ${table}
         (monitor_id, region_id, bucket, checks_total, checks_up,
          latency_sum, latency_count, latency_min, latency_max)
       SELECT * FROM unnest(
         $1::bigint[], $2::smallint[], $3::timestamptz[], $4::int[], $5::int[],
         $6::bigint[], $7::int[], $8::int[], $9::int[]
       )
       ON CONFLICT (monitor_id, region_id, bucket) DO UPDATE SET
         checks_total  = ${table}.checks_total  + EXCLUDED.checks_total,
         checks_up     = ${table}.checks_up     + EXCLUDED.checks_up,
         latency_sum   = ${table}.latency_sum   + EXCLUDED.latency_sum,
         latency_count = ${table}.latency_count + EXCLUDED.latency_count,
         latency_min   = LEAST(${table}.latency_min, EXCLUDED.latency_min),
         latency_max   = GREATEST(${table}.latency_max, EXCLUDED.latency_max)`,
      [
        deltas.map((d) => d.monitorId),
        deltas.map((d) => d.regionId),
        deltas.map((d) => d.bucket),
        deltas.map((d) => d.checksTotal),
        deltas.map((d) => d.checksUp),
        deltas.map((d) => d.latencySum),
        deltas.map((d) => d.latencyCount),
        deltas.map((d) => d.latencyMin),
        deltas.map((d) => d.latencyMax),
      ],
    );
  }
}

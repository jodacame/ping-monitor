import type { CheckOutcome } from '@ping/core';
import { type CheckResultRow, encodeErrorKind, type RollupDelta } from '@ping/db';
import { truncateToDayUtc, truncateToHourUtc } from './time-buckets.js';

/**
 * In-memory write buffer.
 *
 * Raw results accumulate as rows; hourly and daily statistics accumulate as
 * incremental deltas keyed by (monitor, region, bucket). Flushing turns a burst
 * of checks into three batched statements (raw insert + two rollup upserts)
 * instead of many small writes — the key to sustaining high check throughput.
 */

interface MutableDelta {
  monitorId: string;
  regionId: number;
  bucket: Date;
  checksTotal: number;
  checksUp: number;
  latencySum: number;
  latencyCount: number;
  latencyMin: number | null;
  latencyMax: number | null;
}

export interface BufferedWrites {
  readonly rows: CheckResultRow[];
  readonly hourly: RollupDelta[];
  readonly daily: RollupDelta[];
}

export class ResultBuffer {
  private rows: CheckResultRow[] = [];
  private readonly hourly = new Map<string, MutableDelta>();
  private readonly daily = new Map<string, MutableDelta>();

  get size(): number {
    return this.rows.length;
  }

  add(monitorId: string, regionId: number, checkedAt: Date, outcome: CheckOutcome): void {
    this.rows.push({
      monitorId,
      regionId,
      checkedAt,
      up: outcome.up,
      responseMs: outcome.responseMs,
      statusCode: outcome.statusCode ?? null,
      errorKind: outcome.error ? encodeErrorKind(outcome.error.kind) : null,
    });

    this.accumulate(this.hourly, monitorId, regionId, truncateToHourUtc(checkedAt), outcome);
    this.accumulate(this.daily, monitorId, regionId, truncateToDayUtc(checkedAt), outcome);
  }

  private accumulate(
    map: Map<string, MutableDelta>,
    monitorId: string,
    regionId: number,
    bucket: Date,
    outcome: CheckOutcome,
  ): void {
    const key = `${monitorId}:${regionId}:${bucket.getTime()}`;
    let delta = map.get(key);
    if (!delta) {
      delta = {
        monitorId,
        regionId,
        bucket,
        checksTotal: 0,
        checksUp: 0,
        latencySum: 0,
        latencyCount: 0,
        latencyMin: null,
        latencyMax: null,
      };
      map.set(key, delta);
    }

    delta.checksTotal += 1;
    if (outcome.up) delta.checksUp += 1;
    if (outcome.responseMs !== null) {
      delta.latencySum += outcome.responseMs;
      delta.latencyCount += 1;
      delta.latencyMin =
        delta.latencyMin === null ? outcome.responseMs : Math.min(delta.latencyMin, outcome.responseMs);
      delta.latencyMax =
        delta.latencyMax === null ? outcome.responseMs : Math.max(delta.latencyMax, outcome.responseMs);
    }
  }

  /** Return everything buffered and reset for the next window. */
  drain(): BufferedWrites {
    const writes: BufferedWrites = {
      rows: this.rows,
      hourly: [...this.hourly.values()],
      daily: [...this.daily.values()],
    };
    this.rows = [];
    this.hourly.clear();
    this.daily.clear();
    return writes;
  }
}

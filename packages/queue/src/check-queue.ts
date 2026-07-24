import type { Redis } from 'ioredis';
import type { Logger } from '@ping/config';
import type { MonitorType } from '@ping/core';

/**
 * The check queue: one Redis stream per region (`<prefix>:<regionId>`), consumed
 * by a consumer group so many workers in a region share the load with
 * at-least-once delivery. Messages a crashed worker never acked are recovered
 * via XAUTOCLAIM.
 */

export interface CheckJob {
  readonly monitorId: string;
  readonly regionId: number;
  readonly type: MonitorType;
  readonly target: string;
  readonly config: Record<string, unknown>;
  readonly timeoutMs: number;
}

/** Approximate cap per region stream to bound memory if consumers fall behind. */
const DEFAULT_MAX_LEN = 500_000;
/** Messages idle longer than this (ms) are reclaimed from dead consumers. */
const RECLAIM_IDLE_MS = 60_000;

function serialize(job: CheckJob): string {
  return JSON.stringify(job);
}

function deserialize(payload: string): CheckJob {
  return JSON.parse(payload) as CheckJob;
}

export class RedisCheckQueue {
  constructor(
    private readonly redis: Redis,
    private readonly prefix: string,
    private readonly group: string,
    private readonly maxLen: number = DEFAULT_MAX_LEN,
  ) {}

  streamKey(regionId: number): string {
    return `${this.prefix}:${regionId}`;
  }

  /** Enqueue a batch of jobs to a region's stream in one round-trip. */
  async enqueue(regionId: number, jobs: readonly CheckJob[]): Promise<number> {
    if (jobs.length === 0) return 0;
    const key = this.streamKey(regionId);
    const pipe = this.redis.pipeline();
    for (const job of jobs) {
      pipe.xadd(key, 'MAXLEN', '~', this.maxLen, '*', 'd', serialize(job));
    }
    await pipe.exec();
    return jobs.length;
  }

  /** Idempotently create the consumer group for a region's stream. */
  async ensureGroup(regionId: number): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', this.streamKey(regionId), this.group, '0', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
    }
  }
}

export interface CheckConsumer {
  /** Begin consuming; resolves when `stop()` completes the current cycle. */
  run(): Promise<void>;
  stop(): void;
}

export interface CheckConsumerOptions {
  readonly readClient: Redis;
  readonly controlClient: Redis;
  readonly stream: string;
  readonly group: string;
  readonly consumerName: string;
  readonly count: number;
  readonly blockMs: number;
  readonly onJob: (job: CheckJob) => Promise<void>;
  readonly logger?: Logger;
}

type StreamEntry = [id: string, fields: string[]];

/** Parse XREADGROUP/XAUTOCLAIM entries into (id, job) pairs, skipping malformed. */
function parseEntries(entries: StreamEntry[], logger?: Logger): Array<[string, CheckJob]> {
  const jobs: Array<[string, CheckJob]> = [];
  for (const [id, fields] of entries) {
    const idx = fields.indexOf('d');
    const payload = idx >= 0 ? fields[idx + 1] : undefined;
    if (payload === undefined) continue;
    try {
      jobs.push([id, deserialize(payload)]);
    } catch (err) {
      logger?.warn({ err, id }, 'discarding malformed check job');
    }
  }
  return jobs;
}

/**
 * Create a consumer that continuously drains a region's stream. Each read batch
 * is processed concurrently; successfully handled messages are acked, failures
 * are left pending for a later reclaim.
 */
export function createCheckConsumer(options: CheckConsumerOptions): CheckConsumer {
  let running = false;

  async function processEntries(entries: Array<[string, CheckJob]>): Promise<void> {
    if (entries.length === 0) return;
    const acked: string[] = [];
    await Promise.all(
      entries.map(async ([id, job]) => {
        try {
          await options.onJob(job);
          acked.push(id);
        } catch (err) {
          options.logger?.error({ err, monitorId: job.monitorId }, 'check job handler failed');
        }
      }),
    );
    if (acked.length > 0) {
      await options.controlClient.xack(options.stream, options.group, ...acked);
    }
  }

  async function reclaimStuck(): Promise<void> {
    // XAUTOCLAIM returns [nextCursor, entries, deleted]. We take one page/cycle.
    const res = (await options.controlClient.xautoclaim(
      options.stream,
      options.group,
      options.consumerName,
      RECLAIM_IDLE_MS,
      '0',
      'COUNT',
      options.count,
    )) as [string, StreamEntry[], string[]];
    await processEntries(parseEntries(res[1] ?? [], options.logger));
  }

  async function readNew(): Promise<void> {
    const res = (await options.readClient.xreadgroup(
      'GROUP',
      options.group,
      options.consumerName,
      'COUNT',
      options.count,
      'BLOCK',
      options.blockMs,
      'STREAMS',
      options.stream,
      '>',
    )) as Array<[string, StreamEntry[]]> | null;
    if (!res) return;
    const streamData = res[0];
    if (!streamData) return;
    await processEntries(parseEntries(streamData[1], options.logger));
  }

  return {
    async run(): Promise<void> {
      running = true;
      while (running) {
        try {
          await reclaimStuck();
          if (!running) break;
          await readNew();
        } catch (err) {
          options.logger?.error({ err }, 'check consumer loop error; backing off');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },
    stop(): void {
      running = false;
    },
  };
}

import type { Logger } from '@ping/config';
import type { InfraRepository, ResultsRepository } from '@ping/db';
import type { CheckConsumer } from '@ping/queue';
import type { ResultBuffer } from './result-buffer.js';

/**
 * A guarded flusher: persists the buffer as batched writes and never lets two
 * flushes overlap (which would double-insert). Time- and size-based triggers
 * both route through the same instance.
 */
export class BufferFlusher {
  private flushing = false;

  constructor(
    private readonly results: ResultsRepository,
    private readonly buffer: ResultBuffer,
    private readonly logger: Logger,
  ) {}

  async flush(): Promise<void> {
    if (this.flushing || this.buffer.size === 0) return;
    this.flushing = true;
    const writes = this.buffer.drain();
    try {
      await this.results.insertResults(writes.rows);
      await this.results.upsertHourly(writes.hourly);
      await this.results.upsertDaily(writes.daily);
    } catch (err) {
      this.logger.error({ err, rows: writes.rows.length }, 'failed to flush check results');
    } finally {
      this.flushing = false;
    }
  }
}

export interface WorkerOptions {
  readonly consumer: CheckConsumer;
  readonly flusher: BufferFlusher;
  readonly infra: InfraRepository;
  readonly regionId: number;
  readonly instance: string;
  readonly version: string | null;
  readonly flushIntervalMs: number;
  readonly logger: Logger;
}

const HEARTBEAT_INTERVAL_MS = 15_000;

/** Owns the worker's runtime: heartbeat, periodic flush and the consume loop. */
export class Worker {
  private flushTimer: NodeJS.Timeout | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private consumerLoop: Promise<void> | null = null;

  constructor(private readonly options: WorkerOptions) {}

  async start(): Promise<void> {
    await this.heartbeat();
    this.heartbeatTimer = setInterval(() => void this.heartbeat(), HEARTBEAT_INTERVAL_MS);
    this.flushTimer = setInterval(() => void this.options.flusher.flush(), this.options.flushIntervalMs);
    this.consumerLoop = this.options.consumer.run();
    this.options.logger.info(
      { regionId: this.options.regionId, instance: this.options.instance },
      'worker started',
    );
  }

  async stop(): Promise<void> {
    this.options.consumer.stop();
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.consumerLoop?.catch(() => undefined);
    await this.options.flusher.flush(); // persist whatever is left
  }

  private async heartbeat(): Promise<void> {
    try {
      await this.options.infra.heartbeat(
        this.options.regionId,
        this.options.instance,
        this.options.version,
      );
    } catch (err) {
      this.options.logger.warn({ err }, 'heartbeat failed');
    }
  }
}

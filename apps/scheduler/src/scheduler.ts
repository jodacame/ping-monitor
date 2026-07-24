import type { Logger, RetentionConfig, SchedulerConfig } from '@ping/config';
import { type Database, SchedulingRepository } from '@ping/db';
import type { CheckJob, RedisCheckQueue } from '@ping/queue';

/**
 * The scheduler loop.
 *
 * Every tick it atomically claims a batch of due (monitor, region) assignments
 * — which also advances their next_check_at — groups them by region and pushes
 * them onto each region's Redis stream. A separate, slower maintenance timer
 * ensures upcoming daily partitions exist and drops partitions past retention.
 *
 * `FOR UPDATE SKIP LOCKED` in the claim query makes this safe to run in
 * multiple replicas: no assignment is ever enqueued twice per due window.
 */
export class Scheduler {
  private readonly scheduling: SchedulingRepository;
  private tickTimer: NodeJS.Timeout | null = null;
  private maintenanceTimer: NodeJS.Timeout | null = null;
  private running = false;
  private ticking = false;

  private static readonly MAINTENANCE_INTERVAL_MS = 3_600_000; // hourly
  private static readonly PARTITION_LOOKAHEAD_DAYS = 3;

  constructor(
    private readonly db: Database,
    private readonly queue: RedisCheckQueue,
    private readonly config: SchedulerConfig,
    private readonly retention: RetentionConfig,
    private readonly logger: Logger,
  ) {
    this.scheduling = new SchedulingRepository(db);
  }

  async start(): Promise<void> {
    this.running = true;
    await this.runMaintenance();
    this.maintenanceTimer = setInterval(() => {
      void this.runMaintenance();
    }, Scheduler.MAINTENANCE_INTERVAL_MS);
    this.scheduleNextTick();
    this.logger.info({ tickMs: this.config.tickMs }, 'scheduler started');
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.tickTimer) clearTimeout(this.tickTimer);
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
  }

  private scheduleNextTick(): void {
    if (!this.running) return;
    this.tickTimer = setTimeout(() => {
      void this.tick().finally(() => this.scheduleNextTick());
    }, this.config.tickMs);
  }

  /** Claim due assignments and dispatch them to region streams. */
  private async tick(): Promise<void> {
    if (this.ticking) return; // never overlap ticks
    this.ticking = true;
    try {
      const due = await this.scheduling.claimDue(this.config.batchSize);
      if (due.length === 0) return;

      const byRegion = new Map<number, CheckJob[]>();
      for (const check of due) {
        const job: CheckJob = {
          monitorId: check.monitorId,
          regionId: check.regionId,
          type: check.type,
          target: check.target,
          config: check.config,
          timeoutMs: check.timeoutMs,
        };
        const bucket = byRegion.get(check.regionId);
        if (bucket) bucket.push(job);
        else byRegion.set(check.regionId, [job]);
      }

      let enqueued = 0;
      for (const [regionId, jobs] of byRegion) {
        enqueued += await this.queue.enqueue(regionId, jobs);
      }
      this.logger.debug({ enqueued, regions: byRegion.size }, 'dispatched checks');
    } catch (err) {
      this.logger.error({ err }, 'scheduler tick failed');
    } finally {
      this.ticking = false;
    }
  }

  /** Ensure future partitions exist and prune partitions past retention. */
  private async runMaintenance(): Promise<void> {
    try {
      await this.scheduling.ensurePartitions(Scheduler.PARTITION_LOOKAHEAD_DAYS);
      const dropped = await this.scheduling.dropOldPartitions(this.retention.rawDays);
      if (dropped.length > 0) {
        this.logger.info({ dropped }, 'dropped expired check_results partitions');
      }
    } catch (err) {
      this.logger.error({ err }, 'partition maintenance failed');
    }
  }
}

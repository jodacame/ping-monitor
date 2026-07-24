import { DomainEventType } from '@ping/core';
import type { Logger } from '@ping/config';
import type { CheckExecutorRegistry } from '@ping/checks';
import type { CheckJob, EventBus } from '@ping/queue';
import type { ResultBuffer } from './result-buffer.js';
import type { StatusEvaluator } from './status-evaluator.js';

/**
 * Processes one check job end to end: execute the probe, buffer the result and
 * rollup deltas, evaluate the (region + quorum) status transition, and publish a
 * domain event when the monitor's overall status changes.
 */
export class JobProcessor {
  constructor(
    private readonly registry: CheckExecutorRegistry,
    private readonly buffer: ResultBuffer,
    private readonly evaluator: StatusEvaluator,
    private readonly eventBus: EventBus,
    private readonly logger: Logger,
  ) {}

  async process(job: CheckJob): Promise<void> {
    const checkedAt = new Date();
    const outcome = await this.registry.execute(job.type, {
      target: job.target,
      config: job.config,
      timeoutMs: job.timeoutMs,
    });

    this.buffer.add(job.monitorId, job.regionId, checkedAt, outcome);

    const change = await this.evaluator.evaluate({
      monitorId: job.monitorId,
      regionId: job.regionId,
      up: outcome.up,
      responseMs: outcome.responseMs,
      checkedAt,
      ...(outcome.error ? { error: outcome.error } : {}),
    });

    if (!change) return;

    await this.eventBus.publish({
      type: DomainEventType.MonitorStatusChanged,
      monitorId: change.monitorPublicId,
      workspaceId: change.workspacePublicId,
      monitorName: change.monitorName,
      from: change.from,
      to: change.to,
      at: change.at.toISOString(),
      responseMs: change.responseMs,
      ...(change.error ? { error: change.error } : {}),
    });

    this.logger.info(
      { monitor: change.monitorPublicId, from: change.from, to: change.to },
      'monitor status changed',
    );
  }
}

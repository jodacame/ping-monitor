import { type CheckOutcome, type MonitorType, NotFoundError } from '@ping/core';

/**
 * Strategy interface for probes. Each monitor type has one executor; the worker
 * resolves the right one from the registry and never branches on type itself
 * (Open/Closed — adding TCP/ICMP means adding an executor, not editing callers).
 */

export interface CheckContext {
  readonly target: string;
  readonly config: Record<string, unknown>;
  readonly timeoutMs: number;
}

export interface CheckExecutor {
  readonly type: MonitorType;
  execute(context: CheckContext): Promise<CheckOutcome>;
}

/** Registry of executors keyed by monitor type. */
export class CheckExecutorRegistry {
  private readonly executors = new Map<MonitorType, CheckExecutor>();

  register(executor: CheckExecutor): this {
    this.executors.set(executor.type, executor);
    return this;
  }

  has(type: MonitorType): boolean {
    return this.executors.has(type);
  }

  get(type: MonitorType): CheckExecutor {
    const executor = this.executors.get(type);
    if (!executor) throw new NotFoundError(`No check executor registered for type "${type}"`);
    return executor;
  }

  execute(type: MonitorType, context: CheckContext): Promise<CheckOutcome> {
    return this.get(type).execute(context);
  }
}

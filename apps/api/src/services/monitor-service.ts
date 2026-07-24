import { MonitorType, NotFoundError, ValidationError, newId } from '@ping/core';
import { parseHttpConfig, parseTcpConfig } from '@ping/checks';
import {
  type Database,
  InfraRepository,
  type ListMonitorsFilter,
  type MonitorRecord,
  MonitorGroupRepository,
  MonitorRepository,
  TagRepository,
} from '@ping/db';

export interface CreateMonitorInput {
  readonly name: string;
  readonly type: MonitorType;
  readonly target: string;
  readonly config: Record<string, unknown>;
  readonly intervalSeconds: number;
  readonly timeoutMs: number;
  readonly failureThreshold: number;
  readonly recoveryThreshold: number;
  readonly quorum: number;
  readonly regionIds: number[];
  /** Public id of the group to place this monitor in, or null for none. */
  readonly groupId?: string | null;
  /** Tag ids to assign to this monitor. */
  readonly tagIds?: string[];
}

export type UpdateMonitorInput = Partial<
  Pick<
    CreateMonitorInput,
    | 'name'
    | 'target'
    | 'config'
    | 'intervalSeconds'
    | 'timeoutMs'
    | 'failureThreshold'
    | 'recoveryThreshold'
    | 'quorum'
    | 'regionIds'
    | 'groupId'
    | 'tagIds'
  >
>;

export interface MonitorView extends MonitorRecord {
  readonly regionIds: number[];
}

/**
 * Monitor use cases. Validates type-specific configuration and target shape,
 * resolves the set of probe regions, and keeps monitor + assignments consistent
 * inside a transaction.
 */
export class MonitorService {
  constructor(private readonly db: Database) {}

  async create(workspaceId: string, input: CreateMonitorInput): Promise<MonitorView> {
    const config = this.normalizeConfig(input.type, input.target, input.config);
    const regionIds = await this.resolveRegions(input.regionIds);
    const quorum = this.clampQuorum(input.quorum, regionIds.length);
    const groupInternalId = await this.resolveGroup(workspaceId, input.groupId ?? null);
    const tagIds = input.tagIds?.length
      ? await new TagRepository(this.db).resolveIds(workspaceId, input.tagIds)
      : [];

    const monitor = await this.db.transaction(async (tx) => {
      const repo = new MonitorRepository(tx);
      const created = await repo.createWithRegions({
        publicId: newId(),
        workspaceId,
        name: input.name.trim(),
        type: input.type,
        target: input.target.trim(),
        config,
        intervalSeconds: input.intervalSeconds,
        timeoutMs: input.timeoutMs,
        failureThreshold: input.failureThreshold,
        recoveryThreshold: input.recoveryThreshold,
        quorum,
        groupInternalId,
        regionIds,
      });
      if (tagIds.length) await repo.replaceTags(created.publicId, workspaceId, tagIds);
      return created;
    });
    return this.get(workspaceId, monitor.publicId);
  }

  async list(filter: ListMonitorsFilter): Promise<{ items: MonitorRecord[]; total: number }> {
    return new MonitorRepository(this.db).list(filter);
  }

  async get(workspaceId: string, publicId: string): Promise<MonitorView> {
    const repo = new MonitorRepository(this.db);
    const monitor = await repo.findByPublicId(publicId, workspaceId);
    if (!monitor) throw new NotFoundError('Monitor not found');
    const regionIds = await repo.listRegionIds(monitor.id);
    return { ...monitor, regionIds };
  }

  async update(
    workspaceId: string,
    publicId: string,
    input: UpdateMonitorInput,
  ): Promise<MonitorView> {
    const existing = await this.get(workspaceId, publicId);

    const config =
      input.config !== undefined
        ? this.normalizeConfig(existing.type, input.target ?? existing.target, input.config)
        : undefined;

    const groupInternalId =
      input.groupId !== undefined ? await this.resolveGroup(workspaceId, input.groupId) : undefined;

    const updated = await this.db.transaction(async (tx) => {
      const repo = new MonitorRepository(tx);
      const monitor = await repo.update(publicId, workspaceId, {
        ...(input.name !== undefined ? { name: input.name.trim() } : {}),
        ...(input.target !== undefined ? { target: input.target.trim() } : {}),
        ...(config !== undefined ? { config } : {}),
        ...(input.intervalSeconds !== undefined ? { intervalSeconds: input.intervalSeconds } : {}),
        ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
        ...(input.failureThreshold !== undefined
          ? { failureThreshold: input.failureThreshold }
          : {}),
        ...(input.recoveryThreshold !== undefined
          ? { recoveryThreshold: input.recoveryThreshold }
          : {}),
        ...(input.quorum !== undefined ? { quorum: input.quorum } : {}),
        ...(groupInternalId !== undefined ? { groupInternalId } : {}),
      });
      if (!monitor) throw new NotFoundError('Monitor not found');

      if (input.regionIds !== undefined) {
        const regionIds = await this.resolveRegions(input.regionIds);
        await repo.replaceAssignments(publicId, workspaceId, regionIds);
      }
      if (input.tagIds !== undefined) {
        const tagIds = await new TagRepository(this.db).resolveIds(workspaceId, input.tagIds);
        await repo.replaceTags(publicId, workspaceId, tagIds);
      }
      return monitor;
    });

    const regionIds = await new MonitorRepository(this.db).listRegionIds(updated.id);
    return { ...updated, regionIds };
  }

  async setPaused(workspaceId: string, publicId: string, paused: boolean): Promise<void> {
    const monitor = await this.get(workspaceId, publicId);
    await this.db.transaction((tx) => new MonitorRepository(tx).setEnabled(monitor.id, !paused));
  }

  async delete(workspaceId: string, publicId: string): Promise<void> {
    const deleted = await new MonitorRepository(this.db).delete(publicId, workspaceId);
    if (!deleted) throw new NotFoundError('Monitor not found');
  }

  // --- helpers ---------------------------------------------------------------

  private normalizeConfig(
    type: MonitorType,
    target: string,
    config: Record<string, unknown>,
  ): Record<string, unknown> {
    if (type === MonitorType.Http) {
      let url: URL;
      try {
        url = new URL(target);
      } catch {
        throw new ValidationError('HTTP monitor target must be a valid URL');
      }
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new ValidationError('HTTP monitor target must use http or https');
      }
      try {
        return { ...parseHttpConfig(config) };
      } catch (err) {
        throw new ValidationError(
          err instanceof Error ? err.message : 'Invalid HTTP monitor config',
        );
      }
    }

    if (type === MonitorType.Tcp) {
      if (!target.trim()) throw new ValidationError('TCP monitor requires a host');
      try {
        return { ...parseTcpConfig(config) };
      } catch {
        throw new ValidationError('TCP monitor requires a valid port (1–65535)');
      }
    }

    if (type === MonitorType.Icmp) {
      if (!target.trim()) throw new ValidationError('Ping monitor requires a host');
      return {};
    }

    throw new ValidationError(`Monitor type "${type}" is not supported`);
  }

  private async resolveRegions(requested: number[]): Promise<number[]> {
    const available = await new InfraRepository(this.db).listRegions(true);
    const validIds = new Set(available.map((r) => r.id));
    const filtered = [...new Set(requested)].filter((id) => validIds.has(id));
    if (filtered.length > 0) return filtered;
    // Fall back to the default region so a monitor is always schedulable.
    const fallback = available[0]?.id;
    if (fallback === undefined) throw new ValidationError('No probe regions are configured');
    return [fallback];
  }

  private clampQuorum(quorum: number, regionCount: number): number {
    return Math.min(Math.max(1, quorum), Math.max(1, regionCount));
  }

  /** Resolve a group public id to its internal id (null when ungrouped). */
  private async resolveGroup(
    workspaceId: string,
    groupPublicId: string | null,
  ): Promise<string | null> {
    if (!groupPublicId) return null;
    const id = await new MonitorGroupRepository(this.db).resolveInternalId(
      groupPublicId,
      workspaceId,
    );
    if (!id) throw new ValidationError('Group not found');
    return id;
  }
}

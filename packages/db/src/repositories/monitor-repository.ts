import { MonitorStatus, type MonitorType } from '@ping/core';
import type { Queryable } from '../pool.js';
import {
  decodeMonitorStatus,
  decodeMonitorType,
  encodeMonitorStatus,
  encodeMonitorType,
} from '../codecs.js';
import type { MonitorRecord } from './models.js';

interface MonitorRow {
  id: string;
  public_id: string;
  workspace_id: string;
  name: string;
  type: number;
  target: string;
  config: Record<string, unknown>;
  interval_seconds: number;
  timeout_ms: number;
  failure_threshold: number;
  recovery_threshold: number;
  quorum: number;
  enabled: boolean;
  status: number;
  last_checked_at: Date | null;
  last_status_changed_at: Date | null;
  last_response_ms: number | null;
  group_public_id: string | null;
  group_name: string | null;
  created_at: Date;
  updated_at: Date;
}

// Columns returned by INSERT/UPDATE (single-table; no group join possible here).
const RETURNING = 'public_id';

// Joined projection used by all reads, exposing the group's public id + name.
const SELECT_JOINED = `
  SELECT m.id, m.public_id, m.workspace_id, m.name, m.type, m.target, m.config,
         m.interval_seconds, m.timeout_ms, m.failure_threshold, m.recovery_threshold,
         m.quorum, m.enabled, m.status, m.last_checked_at, m.last_status_changed_at,
         m.last_response_ms, m.created_at, m.updated_at,
         g.public_id AS group_public_id, g.name AS group_name
  FROM monitors m
  LEFT JOIN monitor_groups g ON g.id = m.group_id`;

function toRecord(row: MonitorRow): MonitorRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    workspaceId: row.workspace_id,
    name: row.name,
    type: decodeMonitorType(row.type),
    target: row.target,
    config: row.config,
    intervalSeconds: row.interval_seconds,
    timeoutMs: row.timeout_ms,
    failureThreshold: row.failure_threshold,
    recoveryThreshold: row.recovery_threshold,
    quorum: row.quorum,
    enabled: row.enabled,
    status: decodeMonitorStatus(row.status),
    lastCheckedAt: row.last_checked_at,
    lastStatusChangedAt: row.last_status_changed_at,
    lastResponseMs: row.last_response_ms,
    groupId: row.group_public_id,
    groupName: row.group_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateMonitorInput {
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly type: MonitorType;
  readonly target: string;
  readonly config: Record<string, unknown>;
  readonly intervalSeconds: number;
  readonly timeoutMs: number;
  readonly failureThreshold: number;
  readonly recoveryThreshold: number;
  readonly quorum: number;
  /** Internal group id, or null for ungrouped. */
  readonly groupInternalId: string | null;
  /** Region ids this monitor is probed from (>= 1). */
  readonly regionIds: readonly number[];
}

export interface UpdateMonitorInput {
  readonly name?: string;
  readonly target?: string;
  readonly config?: Record<string, unknown>;
  readonly intervalSeconds?: number;
  readonly timeoutMs?: number;
  readonly failureThreshold?: number;
  readonly recoveryThreshold?: number;
  readonly quorum?: number;
  /** undefined = unchanged; null = clear; string = set internal group id. */
  readonly groupInternalId?: string | null;
}

export interface ListMonitorsFilter {
  readonly workspaceId: string;
  readonly status?: MonitorStatus;
  readonly tagId?: string;
  readonly search?: string;
  readonly limit: number;
  readonly offset: number;
}

export interface ListMonitorsResult {
  readonly items: MonitorRecord[];
  readonly total: number;
}

/**
 * Persistence for monitors and their per-region scheduling assignments.
 * Reads expose the monitor's group (public id + name) via a left join.
 */
export class MonitorRepository {
  constructor(private readonly db: Queryable) {}

  /** Create a monitor together with one assignment per region. */
  async createWithRegions(input: CreateMonitorInput): Promise<MonitorRecord> {
    const res = await this.db.query<{ public_id: string }>(
      `INSERT INTO monitors
         (public_id, workspace_id, name, type, target, config,
          interval_seconds, timeout_ms, failure_threshold, recovery_threshold, quorum, group_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       RETURNING ${RETURNING}`,
      [
        input.publicId,
        input.workspaceId,
        input.name,
        encodeMonitorType(input.type),
        input.target,
        JSON.stringify(input.config),
        input.intervalSeconds,
        input.timeoutMs,
        input.failureThreshold,
        input.recoveryThreshold,
        input.quorum,
        input.groupInternalId,
      ],
    );
    const publicId = res.rows[0]!.public_id;
    await this.replaceAssignments(publicId, input.workspaceId, input.regionIds);
    return (await this.findByPublicId(publicId, input.workspaceId))!;
  }

  /** Replace the set of regions a monitor (by public id) is probed from. */
  async replaceAssignments(
    publicId: string,
    workspaceId: string,
    regionIds: readonly number[],
  ): Promise<void> {
    const res = await this.db.query<{ id: string }>(
      'SELECT id FROM monitors WHERE public_id = $1 AND workspace_id = $2',
      [publicId, workspaceId],
    );
    const monitorId = res.rows[0]?.id;
    if (!monitorId) return;
    await this.db.query('DELETE FROM monitor_assignments WHERE monitor_id = $1', [monitorId]);
    if (regionIds.length === 0) return;
    await this.db.query(
      `INSERT INTO monitor_assignments (monitor_id, region_id)
       SELECT $1, r FROM unnest($2::smallint[]) AS r
       ON CONFLICT (monitor_id, region_id) DO NOTHING`,
      [monitorId, regionIds],
    );
  }

  async findByPublicId(publicId: string, workspaceId: string): Promise<MonitorRecord | null> {
    const res = await this.db.query<MonitorRow>(
      `${SELECT_JOINED} WHERE m.public_id = $1 AND m.workspace_id = $2`,
      [publicId, workspaceId],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async list(filter: ListMonitorsFilter): Promise<ListMonitorsResult> {
    const conditions: string[] = ['m.workspace_id = $1'];
    const params: unknown[] = [filter.workspaceId];

    if (filter.status !== undefined) {
      params.push(encodeMonitorStatus(filter.status));
      conditions.push(`m.status = $${params.length}`);
    }
    if (filter.search) {
      params.push(`%${filter.search}%`);
      conditions.push(`m.name ILIKE $${params.length}`);
    }
    if (filter.tagId) {
      params.push(filter.tagId);
      conditions.push(
        `EXISTS (SELECT 1 FROM monitor_tags mt WHERE mt.monitor_id = m.id AND mt.tag_id = $${params.length})`,
      );
    }

    const where = conditions.join(' AND ');
    const totalRes = await this.db.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM monitors m WHERE ${where}`,
      params,
    );
    const total = Number(totalRes.rows[0]?.count ?? 0);

    params.push(filter.limit, filter.offset);
    const rows = await this.db.query<MonitorRow>(
      `${SELECT_JOINED} WHERE ${where}
       ORDER BY m.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { items: rows.rows.map(toRecord), total };
  }

  async update(
    publicId: string,
    workspaceId: string,
    input: UpdateMonitorInput,
  ): Promise<MonitorRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (column: string, value: unknown): void => {
      params.push(value);
      sets.push(`${column} = $${params.length}`);
    };

    if (input.name !== undefined) set('name', input.name);
    if (input.target !== undefined) set('target', input.target);
    if (input.config !== undefined) set('config', JSON.stringify(input.config));
    if (input.intervalSeconds !== undefined) set('interval_seconds', input.intervalSeconds);
    if (input.timeoutMs !== undefined) set('timeout_ms', input.timeoutMs);
    if (input.failureThreshold !== undefined) set('failure_threshold', input.failureThreshold);
    if (input.recoveryThreshold !== undefined) set('recovery_threshold', input.recoveryThreshold);
    if (input.quorum !== undefined) set('quorum', input.quorum);
    if (input.groupInternalId !== undefined) set('group_id', input.groupInternalId);

    if (sets.length === 0) return this.findByPublicId(publicId, workspaceId);

    params.push(publicId, workspaceId);
    const res = await this.db.query<{ public_id: string }>(
      `UPDATE monitors SET ${sets.join(', ')}
       WHERE public_id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING ${RETURNING}`,
      params,
    );
    if (res.rows.length === 0) return null;
    return this.findByPublicId(publicId, workspaceId);
  }

  /** Pause/resume a monitor and mirror the flag onto its assignments. */
  async setEnabled(monitorId: string, enabled: boolean): Promise<void> {
    await this.db.query(
      `UPDATE monitors
       SET enabled = $2, status = CASE WHEN $2 THEN $3 ELSE $4 END
       WHERE id = $1`,
      [
        monitorId,
        enabled,
        encodeMonitorStatus(MonitorStatus.Pending),
        encodeMonitorStatus(MonitorStatus.Paused),
      ],
    );
    await this.db.query(
      `UPDATE monitor_assignments SET enabled = $2,
         next_check_at = CASE WHEN $2 THEN now() ELSE next_check_at END
       WHERE monitor_id = $1`,
      [monitorId, enabled],
    );
  }

  async delete(publicId: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.query(
      'DELETE FROM monitors WHERE public_id = $1 AND workspace_id = $2',
      [publicId, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Region ids a monitor is currently probed from. */
  async listRegionIds(monitorId: string): Promise<number[]> {
    const res = await this.db.query<{ region_id: number }>(
      'SELECT region_id FROM monitor_assignments WHERE monitor_id = $1 ORDER BY region_id',
      [monitorId],
    );
    return res.rows.map((r) => r.region_id);
  }
}

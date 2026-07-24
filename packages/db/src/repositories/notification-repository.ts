import type { Queryable } from '../pool.js';

/**
 * Persistence for notification channels and the delivery log. `type` is kept as
 * a plain string so this layer stays decoupled from `@ping/notifications`
 * (the API/notifier interpret it).
 */

export interface NotificationChannelRecord {
  readonly id: string;
  readonly publicId: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly name: string;
  readonly config: Record<string, unknown>;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Minimal shape the notifier needs to dispatch. */
export interface DispatchableChannel {
  readonly id: string;
  readonly type: string;
  readonly name: string;
  readonly config: Record<string, unknown>;
}

interface ChannelRow {
  id: string;
  public_id: string;
  workspace_id: string;
  type: string;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: ChannelRow): NotificationChannelRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    workspaceId: row.workspace_id,
    type: row.type,
    name: row.name,
    config: row.config,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = 'id, public_id, workspace_id, type, name, config, enabled, created_at, updated_at';

export interface CreateChannelInput {
  readonly publicId: string;
  readonly workspaceId: string;
  readonly type: string;
  readonly name: string;
  readonly config: Record<string, unknown>;
  readonly enabled: boolean;
}

export interface UpdateChannelInput {
  readonly name?: string;
  readonly config?: Record<string, unknown>;
  readonly enabled?: boolean;
}

export class NotificationChannelRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateChannelInput): Promise<NotificationChannelRecord> {
    const res = await this.db.query<ChannelRow>(
      `INSERT INTO notification_channels (public_id, workspace_id, type, name, config, enabled)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${COLUMNS}`,
      [
        input.publicId,
        input.workspaceId,
        input.type,
        input.name,
        JSON.stringify(input.config),
        input.enabled,
      ],
    );
    return toRecord(res.rows[0]!);
  }

  async list(workspaceId: string): Promise<NotificationChannelRecord[]> {
    const res = await this.db.query<ChannelRow>(
      `SELECT ${COLUMNS} FROM notification_channels WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
    return res.rows.map(toRecord);
  }

  async findByPublicId(
    publicId: string,
    workspaceId: string,
  ): Promise<NotificationChannelRecord | null> {
    const res = await this.db.query<ChannelRow>(
      `SELECT ${COLUMNS} FROM notification_channels WHERE public_id = $1 AND workspace_id = $2`,
      [publicId, workspaceId],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async update(
    publicId: string,
    workspaceId: string,
    input: UpdateChannelInput,
  ): Promise<NotificationChannelRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown): void => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.name !== undefined) set('name', input.name);
    if (input.config !== undefined) set('config', JSON.stringify(input.config));
    if (input.enabled !== undefined) set('enabled', input.enabled);
    if (sets.length === 0) return this.findByPublicId(publicId, workspaceId);

    params.push(publicId, workspaceId);
    const res = await this.db.query<ChannelRow>(
      `UPDATE notification_channels SET ${sets.join(', ')}
       WHERE public_id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING ${COLUMNS}`,
      params,
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async delete(publicId: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.query(
      'DELETE FROM notification_channels WHERE public_id = $1 AND workspace_id = $2',
      [publicId, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Resolve channel public ids to internal ids within a workspace (order preserved). */
  async resolveInternalIds(workspaceId: string, publicIds: readonly string[]): Promise<string[]> {
    if (publicIds.length === 0) return [];
    const res = await this.db.query<{ id: string; public_id: string }>(
      'SELECT id, public_id FROM notification_channels WHERE workspace_id = $1 AND public_id = ANY($2::text[])',
      [workspaceId, publicIds],
    );
    const byPublic = new Map(res.rows.map((r) => [r.public_id, r.id]));
    return publicIds.map((p) => byPublic.get(p)).filter((v): v is string => Boolean(v));
  }

  /** Enabled channels linked to a specific monitor (per-monitor notifier path). */
  async listEnabledForMonitorPublicId(monitorPublicId: string): Promise<DispatchableChannel[]> {
    const res = await this.db.query<{ id: string; type: string; name: string; config: Record<string, unknown> }>(
      `SELECT c.id, c.type, c.name, c.config
       FROM monitor_notifications mn
       JOIN notification_channels c ON c.id = mn.channel_id
       JOIN monitors m ON m.id = mn.monitor_id
       WHERE m.public_id = $1 AND c.enabled`,
      [monitorPublicId],
    );
    return res.rows;
  }

  /** Enabled channels for a workspace resolved by its public id (notifier path). */
  async listEnabledByWorkspacePublicId(workspacePublicId: string): Promise<DispatchableChannel[]> {
    const res = await this.db.query<{ id: string; type: string; name: string; config: Record<string, unknown> }>(
      `SELECT c.id, c.type, c.name, c.config
       FROM notification_channels c
       JOIN workspaces w ON w.id = c.workspace_id
       WHERE w.public_id = $1 AND c.enabled`,
      [workspacePublicId],
    );
    return res.rows;
  }

  async recordDelivery(
    channelId: string,
    monitorPublicId: string,
    sent: boolean,
    detail: string | null,
  ): Promise<void> {
    await this.db.query(
      `INSERT INTO notification_deliveries (channel_id, monitor_public_id, status, detail)
       VALUES ($1, $2, $3, $4)`,
      [channelId, monitorPublicId, sent ? 1 : 0, detail],
    );
  }
}

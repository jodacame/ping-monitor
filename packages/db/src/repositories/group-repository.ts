import type { Queryable } from '../pool.js';
import type { MonitorGroupRecord } from './models.js';

interface GroupRow {
  id: string;
  public_id: string;
  workspace_id: string;
  name: string;
  sort_order: number;
  created_at: Date;
  updated_at: Date;
}

function toRecord(row: GroupRow): MonitorGroupRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    workspaceId: row.workspace_id,
    name: row.name,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const COLUMNS = 'id, public_id, workspace_id, name, sort_order, created_at, updated_at';

export interface CreateGroupInput {
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly sortOrder?: number;
}

/** Persistence for one-level monitor groups. */
export class MonitorGroupRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateGroupInput): Promise<MonitorGroupRecord> {
    const res = await this.db.query<GroupRow>(
      `INSERT INTO monitor_groups (public_id, workspace_id, name, sort_order)
       VALUES ($1, $2, $3, $4)
       RETURNING ${COLUMNS}`,
      [input.publicId, input.workspaceId, input.name, input.sortOrder ?? 0],
    );
    return toRecord(res.rows[0]!);
  }

  async list(workspaceId: string): Promise<MonitorGroupRecord[]> {
    const res = await this.db.query<GroupRow>(
      `SELECT ${COLUMNS} FROM monitor_groups WHERE workspace_id = $1 ORDER BY sort_order, name`,
      [workspaceId],
    );
    return res.rows.map(toRecord);
  }

  async findByPublicId(publicId: string, workspaceId: string): Promise<MonitorGroupRecord | null> {
    const res = await this.db.query<GroupRow>(
      `SELECT ${COLUMNS} FROM monitor_groups WHERE public_id = $1 AND workspace_id = $2`,
      [publicId, workspaceId],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Resolve the internal id of a group by public id within a workspace. */
  async resolveInternalId(publicId: string, workspaceId: string): Promise<string | null> {
    const res = await this.db.query<{ id: string }>(
      'SELECT id FROM monitor_groups WHERE public_id = $1 AND workspace_id = $2',
      [publicId, workspaceId],
    );
    return res.rows[0]?.id ?? null;
  }

  async update(
    publicId: string,
    workspaceId: string,
    input: { name?: string; sortOrder?: number },
  ): Promise<MonitorGroupRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    if (input.name !== undefined) {
      params.push(input.name);
      sets.push(`name = $${params.length}`);
    }
    if (input.sortOrder !== undefined) {
      params.push(input.sortOrder);
      sets.push(`sort_order = $${params.length}`);
    }
    if (sets.length === 0) return this.findByPublicId(publicId, workspaceId);

    params.push(publicId, workspaceId);
    const res = await this.db.query<GroupRow>(
      `UPDATE monitor_groups SET ${sets.join(', ')}
       WHERE public_id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING ${COLUMNS}`,
      params,
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async delete(publicId: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.query(
      'DELETE FROM monitor_groups WHERE public_id = $1 AND workspace_id = $2',
      [publicId, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}

import type { Queryable } from '../pool.js';
import { decodeRole, encodeRole, type WorkspaceRole } from '../codecs.js';
import type { WorkspaceMembership, WorkspaceRecord } from './models.js';

interface WorkspaceRow {
  id: string;
  public_id: string;
  name: string;
  slug: string;
  created_at: Date;
}

function toRecord(row: WorkspaceRow): WorkspaceRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at,
  };
}

export interface CreateWorkspaceInput {
  readonly publicId: string;
  readonly name: string;
  readonly slug: string;
}

/** Persistence for workspaces and their memberships. */
export class WorkspaceRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateWorkspaceInput): Promise<WorkspaceRecord> {
    const res = await this.db.query<WorkspaceRow>(
      `INSERT INTO workspaces (public_id, name, slug)
       VALUES ($1, $2, $3)
       RETURNING id, public_id, name, slug, created_at`,
      [input.publicId, input.name, input.slug],
    );
    return toRecord(res.rows[0]!);
  }

  async addMember(workspaceId: string, userId: string, role: WorkspaceRole): Promise<void> {
    await this.db.query(
      `INSERT INTO workspace_members (workspace_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = EXCLUDED.role`,
      [workspaceId, userId, encodeRole(role)],
    );
  }

  /** All workspaces a user belongs to, with their role. */
  async listForUser(userId: string): Promise<WorkspaceMembership[]> {
    const res = await this.db.query<WorkspaceRow & { role: number }>(
      `SELECT w.id, w.public_id, w.name, w.slug, w.created_at, m.role
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE m.user_id = $1
       ORDER BY w.created_at ASC`,
      [userId],
    );
    return res.rows.map((row) => ({ ...toRecord(row), role: decodeRole(row.role) }));
  }

  /** Resolve a workspace by public id, ensuring the user is a member. */
  async findForUser(publicId: string, userId: string): Promise<WorkspaceMembership | null> {
    const res = await this.db.query<WorkspaceRow & { role: number }>(
      `SELECT w.id, w.public_id, w.name, w.slug, w.created_at, m.role
       FROM workspaces w
       JOIN workspace_members m ON m.workspace_id = w.id
       WHERE w.public_id = $1 AND m.user_id = $2`,
      [publicId, userId],
    );
    const row = res.rows[0];
    return row ? { ...toRecord(row), role: decodeRole(row.role) } : null;
  }

  async slugExists(slug: string): Promise<boolean> {
    const res = await this.db.query('SELECT 1 FROM workspaces WHERE slug = $1', [slug]);
    return res.rowCount === 1;
  }
}

import type { Queryable } from '../pool.js';
import type { TagRecord } from './models.js';

/** Persistence for workspace tags. Tag ids are BIGINT, surfaced as strings. */
export class TagRepository {
  constructor(private readonly db: Queryable) {}

  async list(workspaceId: string): Promise<TagRecord[]> {
    const res = await this.db.query<TagRecord>(
      `SELECT id::text AS id, name, color FROM tags WHERE workspace_id = $1 ORDER BY name`,
      [workspaceId],
    );
    return res.rows;
  }

  /** Create (or update the color of) a tag; unique per (workspace, name). */
  async create(workspaceId: string, name: string, color: string): Promise<TagRecord> {
    const res = await this.db.query<TagRecord>(
      `INSERT INTO tags (workspace_id, name, color)
       VALUES ($1, $2, $3)
       ON CONFLICT (workspace_id, name) DO UPDATE SET color = EXCLUDED.color
       RETURNING id::text AS id, name, color`,
      [workspaceId, name, color],
    );
    return res.rows[0]!;
  }

  async delete(id: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.query('DELETE FROM tags WHERE id = $1 AND workspace_id = $2', [
      id,
      workspaceId,
    ]);
    return (res.rowCount ?? 0) > 0;
  }

  /** Keep only the given tag ids that actually belong to the workspace. */
  async resolveIds(workspaceId: string, ids: readonly string[]): Promise<string[]> {
    if (ids.length === 0) return [];
    const res = await this.db.query<{ id: string }>(
      `SELECT id::text AS id FROM tags WHERE workspace_id = $1 AND id = ANY($2::bigint[])`,
      [workspaceId, ids],
    );
    return res.rows.map((r) => r.id);
  }
}

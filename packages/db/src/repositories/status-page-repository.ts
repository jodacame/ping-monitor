import { type MonitorStatus } from '@ping/core';
import type { Queryable } from '../pool.js';
import { decodeMonitorStatus } from '../codecs.js';

export interface StatusPageRecord {
  readonly id: string;
  readonly publicId: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PublicStatusMonitor {
  readonly id: string;
  readonly name: string;
  readonly status: MonitorStatus;
}

export interface PublicStatusPage {
  readonly title: string;
  readonly description: string | null;
  readonly updatedAt: Date;
  readonly monitors: PublicStatusMonitor[];
}

interface PageRow {
  id: string;
  public_id: string;
  workspace_id: string;
  slug: string;
  title: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

const COLUMNS = 'id, public_id, workspace_id, slug, title, description, created_at, updated_at';

function toRecord(row: PageRow): StatusPageRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    workspaceId: row.workspace_id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface CreateStatusPageInput {
  readonly publicId: string;
  readonly workspaceId: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
}

export class StatusPageRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateStatusPageInput): Promise<StatusPageRecord> {
    const res = await this.db.query<PageRow>(
      `INSERT INTO status_pages (public_id, workspace_id, slug, title, description)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${COLUMNS}`,
      [input.publicId, input.workspaceId, input.slug, input.title, input.description],
    );
    return toRecord(res.rows[0]!);
  }

  async list(workspaceId: string): Promise<StatusPageRecord[]> {
    const res = await this.db.query<PageRow>(
      `SELECT ${COLUMNS} FROM status_pages WHERE workspace_id = $1 ORDER BY created_at DESC`,
      [workspaceId],
    );
    return res.rows.map(toRecord);
  }

  async findByPublicId(publicId: string, workspaceId: string): Promise<StatusPageRecord | null> {
    const res = await this.db.query<PageRow>(
      `SELECT ${COLUMNS} FROM status_pages WHERE public_id = $1 AND workspace_id = $2`,
      [publicId, workspaceId],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async slugExists(slug: string, exceptPublicId?: string): Promise<boolean> {
    const res = await this.db.query(
      `SELECT 1 FROM status_pages WHERE slug = $1 ${exceptPublicId ? 'AND public_id <> $2' : ''}`,
      exceptPublicId ? [slug, exceptPublicId] : [slug],
    );
    return (res.rowCount ?? 0) > 0;
  }

  async update(
    publicId: string,
    workspaceId: string,
    input: { title?: string; description?: string | null; slug?: string },
  ): Promise<StatusPageRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    const set = (col: string, val: unknown): void => {
      params.push(val);
      sets.push(`${col} = $${params.length}`);
    };
    if (input.title !== undefined) set('title', input.title);
    if (input.description !== undefined) set('description', input.description);
    if (input.slug !== undefined) set('slug', input.slug);
    if (sets.length === 0) return this.findByPublicId(publicId, workspaceId);

    params.push(publicId, workspaceId);
    const res = await this.db.query<PageRow>(
      `UPDATE status_pages SET ${sets.join(', ')}
       WHERE public_id = $${params.length - 1} AND workspace_id = $${params.length}
       RETURNING ${COLUMNS}`,
      params,
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async delete(publicId: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.query(
      'DELETE FROM status_pages WHERE public_id = $1 AND workspace_id = $2',
      [publicId, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }

  /** Replace the monitors shown on a page (by internal ids), preserving order. */
  async setMonitors(statusPageId: string, monitorIds: readonly string[]): Promise<void> {
    await this.db.query('DELETE FROM status_page_monitors WHERE status_page_id = $1', [
      statusPageId,
    ]);
    if (monitorIds.length === 0) return;
    await this.db.query(
      `INSERT INTO status_page_monitors (status_page_id, monitor_id, sort_order)
       SELECT $1, m.id, m.ord
       FROM unnest($2::bigint[]) WITH ORDINALITY AS m(id, ord)
       ON CONFLICT DO NOTHING`,
      [statusPageId, monitorIds],
    );
  }

  /** Public ids of the monitors on a page (for the editor). */
  async listMonitorPublicIds(statusPageId: string): Promise<string[]> {
    const res = await this.db.query<{ public_id: string }>(
      `SELECT m.public_id FROM status_page_monitors spm
       JOIN monitors m ON m.id = spm.monitor_id
       WHERE spm.status_page_id = $1 ORDER BY spm.sort_order`,
      [statusPageId],
    );
    return res.rows.map((r) => r.public_id);
  }

  /** The public view of a page by slug (no auth). */
  async getPublicBySlug(slug: string): Promise<PublicStatusPage | null> {
    const pageRes = await this.db.query<PageRow>(
      `SELECT ${COLUMNS} FROM status_pages WHERE slug = $1`,
      [slug],
    );
    const page = pageRes.rows[0];
    if (!page) return null;

    const monRes = await this.db.query<{ id: string; name: string; status: number }>(
      `SELECT m.id, m.name, m.status FROM status_page_monitors spm
       JOIN monitors m ON m.id = spm.monitor_id
       WHERE spm.status_page_id = $1 ORDER BY spm.sort_order`,
      [page.id],
    );

    return {
      title: page.title,
      description: page.description,
      updatedAt: page.updated_at,
      monitors: monRes.rows.map((r) => ({
        id: r.id,
        name: r.name,
        status: decodeMonitorStatus(r.status),
      })),
    };
  }
}

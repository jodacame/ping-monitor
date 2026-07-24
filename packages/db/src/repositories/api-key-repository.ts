import type { Queryable } from '../pool.js';

/** Persistence for developer API keys (only the key hash is stored). */

export interface ApiKeyRecord {
  readonly id: string;
  readonly publicId: string;
  readonly name: string;
  readonly prefix: string;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
}

export interface ApiKeyAuth {
  readonly workspaceId: string;
  readonly workspacePublicId: string;
  readonly keyId: string;
}

interface KeyRow {
  id: string;
  public_id: string;
  name: string;
  prefix: string;
  last_used_at: Date | null;
  created_at: Date;
}

function toRecord(row: KeyRow): ApiKeyRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    prefix: row.prefix,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export interface CreateApiKeyInput {
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly prefix: string;
  readonly keyHash: string;
}

export class ApiKeyRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateApiKeyInput): Promise<ApiKeyRecord> {
    const res = await this.db.query<KeyRow>(
      `INSERT INTO api_keys (public_id, workspace_id, name, prefix, key_hash)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, public_id, name, prefix, last_used_at, created_at`,
      [input.publicId, input.workspaceId, input.name, input.prefix, input.keyHash],
    );
    return toRecord(res.rows[0]!);
  }

  async list(workspaceId: string): Promise<ApiKeyRecord[]> {
    const res = await this.db.query<KeyRow>(
      `SELECT id, public_id, name, prefix, last_used_at, created_at
       FROM api_keys WHERE workspace_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [workspaceId],
    );
    return res.rows.map(toRecord);
  }

  /** Resolve an active key by its hash to the workspace it grants access to. */
  async findActiveByHash(keyHash: string): Promise<ApiKeyAuth | null> {
    const res = await this.db.query<{ id: string; workspace_id: string; workspace_public_id: string }>(
      `SELECT k.id, k.workspace_id, w.public_id AS workspace_public_id
       FROM api_keys k JOIN workspaces w ON w.id = k.workspace_id
       WHERE k.key_hash = $1 AND k.revoked_at IS NULL`,
      [keyHash],
    );
    const row = res.rows[0];
    return row
      ? { keyId: row.id, workspaceId: row.workspace_id, workspacePublicId: row.workspace_public_id }
      : null;
  }

  async touch(id: string): Promise<void> {
    await this.db.query('UPDATE api_keys SET last_used_at = now() WHERE id = $1', [id]);
  }

  async revoke(publicId: string, workspaceId: string): Promise<boolean> {
    const res = await this.db.query(
      `UPDATE api_keys SET revoked_at = now()
       WHERE public_id = $1 AND workspace_id = $2 AND revoked_at IS NULL`,
      [publicId, workspaceId],
    );
    return (res.rowCount ?? 0) > 0;
  }
}

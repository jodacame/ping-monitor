import type { Queryable } from '../pool.js';

/** Persistence for developer API keys (only the key hash is stored). */

export interface ApiKeyRecord {
  readonly id: string;
  readonly publicId: string;
  readonly name: string;
  readonly prefix: string;
  readonly scopes: string[];
  readonly expiresAt: Date | null;
  readonly allowedIps: string[] | null;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
}

export interface ApiKeyAuth {
  readonly workspaceId: string;
  readonly workspacePublicId: string;
  readonly keyId: string;
  readonly scopes: string[];
  readonly allowedIps: string[] | null;
}

interface KeyRow {
  id: string;
  public_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  expires_at: Date | null;
  allowed_ips: string[] | null;
  last_used_at: Date | null;
  created_at: Date;
}

function toRecord(row: KeyRow): ApiKeyRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    name: row.name,
    prefix: row.prefix,
    scopes: row.scopes,
    expiresAt: row.expires_at,
    allowedIps: row.allowed_ips,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

const COLUMNS =
  'id, public_id, name, prefix, scopes, expires_at, allowed_ips, last_used_at, created_at';

export interface CreateApiKeyInput {
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly prefix: string;
  readonly keyHash: string;
  readonly scopes: string[];
  readonly expiresAt: Date | null;
  readonly allowedIps: string[] | null;
}

export class ApiKeyRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateApiKeyInput): Promise<ApiKeyRecord> {
    const res = await this.db.query<KeyRow>(
      `INSERT INTO api_keys
         (public_id, workspace_id, name, prefix, key_hash, scopes, expires_at, allowed_ips)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${COLUMNS}`,
      [
        input.publicId,
        input.workspaceId,
        input.name,
        input.prefix,
        input.keyHash,
        input.scopes,
        input.expiresAt,
        input.allowedIps,
      ],
    );
    return toRecord(res.rows[0]!);
  }

  async list(workspaceId: string): Promise<ApiKeyRecord[]> {
    const res = await this.db.query<KeyRow>(
      `SELECT ${COLUMNS} FROM api_keys WHERE workspace_id = $1 AND revoked_at IS NULL
       ORDER BY created_at DESC`,
      [workspaceId],
    );
    return res.rows.map(toRecord);
  }

  /** Resolve an active (not revoked, not expired) key by its hash. */
  async findActiveByHash(keyHash: string): Promise<ApiKeyAuth | null> {
    const res = await this.db.query<{
      id: string;
      workspace_id: string;
      workspace_public_id: string;
      scopes: string[];
      allowed_ips: string[] | null;
    }>(
      `SELECT k.id, k.workspace_id, w.public_id AS workspace_public_id, k.scopes, k.allowed_ips
       FROM api_keys k JOIN workspaces w ON w.id = k.workspace_id
       WHERE k.key_hash = $1 AND k.revoked_at IS NULL
         AND (k.expires_at IS NULL OR k.expires_at > now())`,
      [keyHash],
    );
    const row = res.rows[0];
    return row
      ? {
          keyId: row.id,
          workspaceId: row.workspace_id,
          workspacePublicId: row.workspace_public_id,
          scopes: row.scopes,
          allowedIps: row.allowed_ips,
        }
      : null;
  }

  /**
   * Whether a key is still usable, by internal id. Used to re-check long-lived
   * connections (WebSockets), which authenticate once at connect time and would
   * otherwise outlive their own revocation.
   */
  async isActive(id: string): Promise<boolean> {
    const res = await this.db.query(
      `SELECT 1 FROM api_keys
        WHERE id = $1
          AND revoked_at IS NULL
          AND (expires_at IS NULL OR expires_at > now())`,
      [id],
    );
    return res.rows.length > 0;
  }

  /**
   * Record that a key was used. Throttled to at most one write per minute per
   * key: "last used" only needs minute precision, and a busy key would
   * otherwise rewrite the same row on every single request.
   */
  async touch(id: string): Promise<void> {
    await this.db.query(
      `UPDATE api_keys SET last_used_at = now()
       WHERE id = $1
         AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')`,
      [id],
    );
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

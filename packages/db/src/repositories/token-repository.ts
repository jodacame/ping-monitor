import type { Queryable } from '../pool.js';

/**
 * Refresh-token persistence. Only SHA-256 hashes are stored, never the raw
 * token, so a database leak does not expose usable credentials.
 */

export interface RefreshTokenRecord {
  readonly id: string;
  readonly userId: string;
  readonly expiresAt: Date;
}

export interface CreateRefreshTokenInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly userAgent: string | null;
}

export class RefreshTokenRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateRefreshTokenInput): Promise<void> {
    await this.db.query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent)
       VALUES ($1, $2, $3, $4)`,
      [input.userId, input.tokenHash, input.expiresAt, input.userAgent],
    );
  }

  /** Look up an active (not revoked, not expired) token by its hash. */
  async findActiveByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const res = await this.db.query<{ id: string; user_id: string; expires_at: Date }>(
      `SELECT id, user_id, expires_at
       FROM refresh_tokens
       WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()`,
      [tokenHash],
    );
    const row = res.rows[0];
    return row ? { id: row.id, userId: row.user_id, expiresAt: row.expires_at } : null;
  }

  async revokeByHash(tokenHash: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE token_hash = $1 AND revoked_at IS NULL`,
      [tokenHash],
    );
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.db.query(
      `UPDATE refresh_tokens SET revoked_at = now()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId],
    );
  }

  /** Housekeeping: delete expired/revoked tokens. Returns rows removed. */
  async pruneExpired(): Promise<number> {
    const res = await this.db.query(
      `DELETE FROM refresh_tokens WHERE expires_at < now() OR revoked_at IS NOT NULL`,
    );
    return res.rowCount ?? 0;
  }
}

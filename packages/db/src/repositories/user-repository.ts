import type { Queryable } from '../pool.js';
import type { UserRecord, UserWithSecret } from './models.js';

interface UserRow {
  id: string;
  public_id: string;
  email: string;
  name: string | null;
  password_hash: string;
  created_at: Date;
}

function toRecord(row: UserRow): UserRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
  };
}

export interface CreateUserInput {
  readonly publicId: string;
  readonly email: string;
  readonly passwordHash: string;
  readonly name: string | null;
}

/** Persistence for application users. */
export class UserRepository {
  constructor(private readonly db: Queryable) {}

  async create(input: CreateUserInput): Promise<UserRecord> {
    const res = await this.db.query<UserRow>(
      `INSERT INTO users (public_id, email, password_hash, name)
       VALUES ($1, $2, $3, $4)
       RETURNING id, public_id, email, name, password_hash, created_at`,
      [input.publicId, input.email, input.passwordHash, input.name],
    );
    return toRecord(res.rows[0]!);
  }

  async findByEmail(email: string): Promise<UserWithSecret | null> {
    const res = await this.db.query<UserRow>(
      `SELECT id, public_id, email, name, password_hash, created_at
       FROM users WHERE email = $1`,
      [email],
    );
    const row = res.rows[0];
    return row ? { ...toRecord(row), passwordHash: row.password_hash } : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const res = await this.db.query<UserRow>(
      `SELECT id, public_id, email, name, password_hash, created_at
       FROM users WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  /** Like findById but includes the password hash (for password verification). */
  async findByIdWithSecret(id: string): Promise<UserWithSecret | null> {
    const res = await this.db.query<UserRow>(
      `SELECT id, public_id, email, name, password_hash, created_at
       FROM users WHERE id = $1`,
      [id],
    );
    const row = res.rows[0];
    return row ? { ...toRecord(row), passwordHash: row.password_hash } : null;
  }

  async findByPublicId(publicId: string): Promise<UserRecord | null> {
    const res = await this.db.query<UserRow>(
      `SELECT id, public_id, email, name, password_hash, created_at
       FROM users WHERE public_id = $1`,
      [publicId],
    );
    const row = res.rows[0];
    return row ? toRecord(row) : null;
  }

  async existsByEmail(email: string): Promise<boolean> {
    const res = await this.db.query('SELECT 1 FROM users WHERE email = $1', [email]);
    return res.rowCount === 1;
  }

  /** Whether any user exists — used to allow bootstrapping the first account. */
  async hasAny(): Promise<boolean> {
    const res = await this.db.query('SELECT 1 FROM users LIMIT 1');
    return res.rowCount === 1;
  }

  /** Replace a user's password hash. Returns false if no such user. */
  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const res = await this.db.query('UPDATE users SET password_hash = $2 WHERE id = $1', [
      id,
      passwordHash,
    ]);
    return res.rowCount === 1;
  }
}

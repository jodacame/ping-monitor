import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { Database } from './pool.js';

/**
 * Tiny, dependency-free migration runner.
 *
 * Migrations are plain `.sql` files in `migrations/`, applied in filename order.
 * Each file runs inside a single transaction and is recorded (with a checksum)
 * in `schema_migrations`. Already-applied files are skipped; a checksum change
 * on an applied file is surfaced as an error to prevent silent drift.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../migrations/', import.meta.url));

export interface MigrationStatus {
  readonly name: string;
  readonly applied: boolean;
  readonly appliedAt?: Date;
}

interface MigrationFile {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

async function ensureRegistry(db: Database): Promise<void> {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      checksum   TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function loadMigrationFiles(dir = MIGRATIONS_DIR): Promise<MigrationFile[]> {
  const entries = await readdir(dir);
  const files = entries.filter((f) => f.endsWith('.sql')).sort();
  return Promise.all(
    files.map(async (name) => {
      const sql = await readFile(join(dir, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      return { name, sql, checksum };
    }),
  );
}

/** Apply all pending migrations. Returns the names that were applied. */
export async function runMigrations(db: Database, dir = MIGRATIONS_DIR): Promise<string[]> {
  await ensureRegistry(db);
  const files = await loadMigrationFiles(dir);

  const appliedRows = await db.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const applied = new Map(appliedRows.rows.map((r) => [r.name, r.checksum]));

  const newlyApplied: string[] = [];
  for (const file of files) {
    const priorChecksum = applied.get(file.name);
    if (priorChecksum !== undefined) {
      if (priorChecksum !== file.checksum) {
        throw new Error(
          `Migration "${file.name}" was modified after being applied ` +
            `(checksum mismatch). Migrations are immutable; add a new one instead.`,
        );
      }
      continue;
    }

    await db.transaction(async (tx) => {
      await tx.query(file.sql);
      await tx.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [
        file.name,
        file.checksum,
      ]);
    });
    newlyApplied.push(file.name);
  }

  return newlyApplied;
}

/** Report which migrations are applied vs pending. */
export async function migrationStatus(
  db: Database,
  dir = MIGRATIONS_DIR,
): Promise<MigrationStatus[]> {
  await ensureRegistry(db);
  const files = await loadMigrationFiles(dir);
  const appliedRows = await db.query<{ name: string; applied_at: Date }>(
    'SELECT name, applied_at FROM schema_migrations',
  );
  const applied = new Map(appliedRows.rows.map((r) => [r.name, r.applied_at]));

  return files.map((f) => {
    const appliedAt = applied.get(f.name);
    return appliedAt
      ? { name: f.name, applied: true, appliedAt }
      : { name: f.name, applied: false };
  });
}

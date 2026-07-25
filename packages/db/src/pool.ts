import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import type { DatabaseConfig } from '@ping/config';
import type { Logger } from '@ping/config';

/**
 * A minimal query surface. Both the pooled `Database` and a transaction client
 * implement it, so repositories can be written once and run either standalone or
 * inside a transaction (Dependency Inversion — they depend on this interface,
 * not on `pg`).
 */
export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<R>>;
}

/** A transaction-scoped queryable. */
export type Transaction = Queryable;

/**
 * Thin, safe wrapper around a `pg.Pool`. Owns connection lifecycle, exposes a
 * typed query method and a transaction helper with automatic COMMIT/ROLLBACK.
 */
export class Database implements Queryable {
  private readonly pool: Pool;
  private readonly log: Logger | undefined;

  constructor(config: DatabaseConfig, log?: Logger) {
    this.pool = new Pool({
      connectionString: config.url,
      max: config.poolMax,
      idleTimeoutMillis: config.idleTimeoutMs,
      // Fail fast rather than hanging forever when the DB is unreachable.
      connectionTimeoutMillis: 10_000,
      application_name: 'ping-monitor',
      // Pin every connection to UTC at startup (no extra round-trip / race) so
      // time-bucket truncation (rollups, partitions) is deterministic.
      options: '-c timezone=UTC',
    });
    this.log = log;
    this.pool.on('error', (err) => {
      this.log?.error({ err }, 'idle postgres client error');
    });
  }

  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResult<R>> {
    return this.pool.query<R>(text, params as unknown[] | undefined);
  }

  /**
   * Run `fn` inside a transaction. Commits on success, rolls back on any thrown
   * error, and always releases the connection back to the pool.
   */
  async transaction<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
    const client: PoolClient = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn(wrapClient(client));
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw err;
    } finally {
      client.release();
    }
  }

  /** Liveness probe used by health endpoints. */
  async healthCheck(): Promise<boolean> {
    const res = await this.pool.query<{ ok: number }>('SELECT 1 AS ok');
    return res.rows[0]?.ok === 1;
  }

  /** Gracefully drain the pool on shutdown. */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

function wrapClient(client: PoolClient): Transaction {
  return {
    query: <R extends QueryResultRow = QueryResultRow>(
      text: string,
      params?: readonly unknown[],
    ): Promise<QueryResult<R>> => client.query<R>(text, params as unknown[] | undefined),
  };
}

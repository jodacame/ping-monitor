import { z } from 'zod';

/**
 * Configuration is loaded per concern (Interface Segregation): each process
 * validates only the environment it actually needs. A worker never requires the
 * API's JWT secret, so it never fails for lacking one.
 *
 * All loaders read from an injectable source (defaults to `process.env`) which
 * keeps them trivially testable.
 */

export type EnvSource = Record<string, string | undefined>;

/** Parse a schema against a source, throwing a readable error on failure. */
function parse<T extends z.ZodTypeAny>(schema: T, source: EnvSource): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  // `safeParse` on a generic `ZodTypeAny` widens `data` to `any`; the value is
  // guaranteed by `schema`, so narrow it back to that schema's output type.
  return result.data as z.infer<T>;
}

// --- Common ------------------------------------------------------------------

const commonSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
});

export interface CommonConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly logLevel: string;
  readonly isProduction: boolean;
}

export function loadCommonConfig(source: EnvSource = process.env): CommonConfig {
  const e = parse(commonSchema, source);
  return { env: e.NODE_ENV, logLevel: e.LOG_LEVEL, isProduction: e.NODE_ENV === 'production' };
}

// --- Database ----------------------------------------------------------------

const databaseSchema = z.object({
  DATABASE_URL: z.string().url(),
  PGPOOL_MAX: z.coerce.number().int().positive().default(10),
  PGPOOL_IDLE_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(30_000),
});

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
  readonly idleTimeoutMs: number;
}

export function loadDatabaseConfig(source: EnvSource = process.env): DatabaseConfig {
  const e = parse(databaseSchema, source);
  return { url: e.DATABASE_URL, poolMax: e.PGPOOL_MAX, idleTimeoutMs: e.PGPOOL_IDLE_TIMEOUT_MS };
}

// --- Redis -------------------------------------------------------------------

const redisSchema = z.object({ REDIS_URL: z.string().url() });

export interface RedisConfig {
  readonly url: string;
}

export function loadRedisConfig(source: EnvSource = process.env): RedisConfig {
  return { url: parse(redisSchema, source).REDIS_URL };
}

// --- API ---------------------------------------------------------------------

const apiSchema = z.object({
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().positive().default(3000),
  JWT_SECRET: z.string().min(16, 'JWT_SECRET must be at least 16 characters'),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2_592_000),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),
  // Open self-service registration. Off by default; the first account is always
  // allowed (clean-install onboarding) regardless of this flag.
  ALLOW_REGISTRATION: z
    .string()
    .optional()
    .transform((v) => v === 'true' || v === '1'),
  // How much of `X-Forwarded-For` to believe. The client IP drives rate limiting
  // and API-key IP allowlists, so trusting a header nobody vouches for lets any
  // caller forge it. Off by default (direct exposure); set to the number of
  // proxies in front of the API (the bundled Compose stack has exactly one:
  // nginx) or to an explicit list of trusted proxy IPs/CIDRs.
  TRUST_PROXY: z.string().default('false'),
});

/** Fastify's `trustProxy` option: false | true | hop count | IP/CIDR list. */
export type TrustProxySetting = boolean | number | string[];

/**
 * `false`/`0`/empty  -> trust nothing (request.ip is the socket address)
 * `true`             -> trust every hop (only safe on a closed network)
 * a positive integer -> trust that many proxies closest to the server
 * anything else      -> comma-separated list of trusted proxy IPs/CIDRs
 */
function parseTrustProxy(raw: string): TrustProxySetting {
  const value = raw.trim();
  if (value === '' || value === 'false' || value === '0') return false;
  if (value === 'true') return true;
  const hops = Number(value);
  if (Number.isInteger(hops) && hops > 0) return hops;
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export interface ApiConfig {
  readonly host: string;
  readonly port: number;
  readonly jwtSecret: string;
  readonly jwtAccessTtl: number;
  readonly jwtRefreshTtl: number;
  readonly corsOrigins: string[];
  readonly allowRegistration: boolean;
  readonly trustProxy: TrustProxySetting;
}

export function loadApiConfig(source: EnvSource = process.env): ApiConfig {
  const e = parse(apiSchema, source);
  return {
    host: e.API_HOST,
    port: e.API_PORT,
    jwtSecret: e.JWT_SECRET,
    jwtAccessTtl: e.JWT_ACCESS_TTL,
    jwtRefreshTtl: e.JWT_REFRESH_TTL,
    corsOrigins: e.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    allowRegistration: e.ALLOW_REGISTRATION,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
  };
}

// --- Scheduler ---------------------------------------------------------------

const schedulerSchema = z.object({
  SCHEDULER_TICK_MS: z.coerce.number().int().positive().default(1000),
  SCHEDULER_BATCH_SIZE: z.coerce.number().int().positive().default(2000),
});

export interface SchedulerConfig {
  readonly tickMs: number;
  readonly batchSize: number;
}

export function loadSchedulerConfig(source: EnvSource = process.env): SchedulerConfig {
  const e = parse(schedulerSchema, source);
  return { tickMs: e.SCHEDULER_TICK_MS, batchSize: e.SCHEDULER_BATCH_SIZE };
}

// --- Worker ------------------------------------------------------------------

const workerSchema = z.object({
  WORKER_CONCURRENCY: z.coerce.number().int().positive().default(100),
  CHECK_QUEUE_STREAM: z.string().default('checks:pending'),
  CHECK_QUEUE_GROUP: z.string().default('workers'),
  RESULT_FLUSH_INTERVAL_MS: z.coerce.number().int().positive().default(1000),
  RESULT_FLUSH_MAX_ROWS: z.coerce.number().int().positive().default(500),
});

export interface WorkerConfig {
  readonly concurrency: number;
  readonly queueStream: string;
  readonly queueGroup: string;
  readonly flushIntervalMs: number;
  readonly flushMaxRows: number;
}

export function loadWorkerConfig(source: EnvSource = process.env): WorkerConfig {
  const e = parse(workerSchema, source);
  return {
    concurrency: e.WORKER_CONCURRENCY,
    queueStream: e.CHECK_QUEUE_STREAM,
    queueGroup: e.CHECK_QUEUE_GROUP,
    flushIntervalMs: e.RESULT_FLUSH_INTERVAL_MS,
    flushMaxRows: e.RESULT_FLUSH_MAX_ROWS,
  };
}

// --- Retention ---------------------------------------------------------------

const retentionSchema = z.object({
  RAW_RETENTION_DAYS: z.coerce.number().int().positive().default(14),
  HOURLY_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
  DAILY_RETENTION_DAYS: z.coerce.number().int().nonnegative().default(0),
});

export interface RetentionConfig {
  readonly rawDays: number;
  readonly hourlyDays: number;
  /** 0 means keep forever. */
  readonly dailyDays: number;
}

export function loadRetentionConfig(source: EnvSource = process.env): RetentionConfig {
  const e = parse(retentionSchema, source);
  return { rawDays: e.RAW_RETENTION_DAYS, hourlyDays: e.HOURLY_RETENTION_DAYS, dailyDays: e.DAILY_RETENTION_DAYS };
}

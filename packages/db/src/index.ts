/**
 * @ping/db — PostgreSQL access layer.
 *
 * Exposes the connection pool, compact codecs, the migration runner and one
 * repository per aggregate. Repositories depend only on the `Queryable`
 * interface, so they compose with transactions transparently.
 */

export * from './pool.js';
export * from './codecs.js';
export * from './migrator.js';

export * from './repositories/models.js';
export * from './repositories/user-repository.js';
export * from './repositories/workspace-repository.js';
export * from './repositories/token-repository.js';
export * from './repositories/monitor-repository.js';
export * from './repositories/scheduling-repository.js';
export * from './repositories/results-repository.js';
export * from './repositories/health-repository.js';
export * from './repositories/infra-repository.js';
export * from './repositories/stats-repository.js';
export * from './repositories/notification-repository.js';
export * from './repositories/group-repository.js';
export * from './repositories/status-page-repository.js';
export * from './repositories/tag-repository.js';
export * from './repositories/api-key-repository.js';

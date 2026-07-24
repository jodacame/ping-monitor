import { Redis, type RedisOptions } from 'ioredis';
import type { RedisConfig } from '@ping/config';

/**
 * Factory for ioredis clients.
 *
 * A dedicated client is used for blocking reads (XREADGROUP BLOCK) so it never
 * contends with the client used for writes/acks. `maxRetriesPerRequest: null`
 * keeps commands queued across reconnects rather than failing mid-flight.
 */
export function createRedis(config: RedisConfig, options: RedisOptions = {}): Redis {
  return new Redis(config.url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
    ...options,
  });
}

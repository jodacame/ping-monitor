import {
  createLogger,
  loadCommonConfig,
  loadDatabaseConfig,
  loadRedisConfig,
  loadRetentionConfig,
  loadSchedulerConfig,
  loadWorkerConfig,
} from '@ping/config';
import { Database } from '@ping/db';
import { RedisCheckQueue, createRedis } from '@ping/queue';
import { Scheduler } from './scheduler.js';

/** Scheduler entrypoint. */
async function main(): Promise<void> {
  const common = loadCommonConfig();
  const logger = createLogger({
    level: common.logLevel,
    pretty: !common.isProduction,
    base: { service: 'scheduler' },
  });

  const db = new Database(loadDatabaseConfig(), logger);
  const redis = createRedis(loadRedisConfig());
  const worker = loadWorkerConfig(); // for the shared stream prefix + group names

  const queue = new RedisCheckQueue(redis, worker.queueStream, worker.queueGroup);
  const scheduler = new Scheduler(
    db,
    queue,
    loadSchedulerConfig(),
    loadRetentionConfig(),
    logger,
  );

  await scheduler.start();

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down scheduler');
    scheduler.stop();
    redis.disconnect();
    await db.close();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console -- last-resort reporting before exit
  console.error(err);
  process.exit(1);
});

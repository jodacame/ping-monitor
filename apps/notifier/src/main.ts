import { hostname } from 'node:os';
import {
  createLogger,
  loadCommonConfig,
  loadDatabaseConfig,
  loadRedisConfig,
} from '@ping/config';
import { Database } from '@ping/db';
import { RedisEventBus, createEventConsumer, createRedis } from '@ping/queue';
import { NotificationDispatcher } from './dispatcher.js';

const GROUP = 'notifier';
const BLOCK_MS = 5_000;
const BATCH = 32;

/** Notifier entrypoint: consume the event bus and dispatch alerts. */
async function main(): Promise<void> {
  const common = loadCommonConfig();
  const logger = createLogger({
    level: common.logLevel,
    pretty: !common.isProduction,
    base: { service: 'notifier' },
  });

  const db = new Database(loadDatabaseConfig(), logger);
  const redisConfig = loadRedisConfig();
  const readClient = createRedis(redisConfig);
  const controlClient = createRedis(redisConfig);

  const eventBus = new RedisEventBus(controlClient);
  await eventBus.ensureGroup(GROUP);

  const dispatcher = new NotificationDispatcher(db, logger);
  const consumer = createEventConsumer({
    readClient,
    controlClient,
    stream: eventBus.streamKey(),
    group: GROUP,
    consumerName: `${hostname()}:${process.pid}`,
    blockMs: BLOCK_MS,
    count: BATCH,
    onEvent: (event) => dispatcher.handle(event),
    logger,
  });

  const loop = consumer.run();
  logger.info('notifier online');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down notifier');
    consumer.stop();
    await loop.catch(() => undefined);
    readClient.disconnect();
    controlClient.disconnect();
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

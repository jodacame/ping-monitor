import { hostname } from 'node:os';
import {
  createLogger,
  loadCommonConfig,
  loadDatabaseConfig,
  loadRedisConfig,
  loadWorkerConfig,
} from '@ping/config';
import { createDefaultRegistry } from '@ping/checks';
import { Database, InfraRepository, ResultsRepository } from '@ping/db';
import { RedisCheckQueue, RedisEventBus, createCheckConsumer, createRedis } from '@ping/queue';
import { JobProcessor } from './job-processor.js';
import { ResultBuffer } from './result-buffer.js';
import { StatusEvaluator } from './status-evaluator.js';
import { BufferFlusher, Worker } from './worker.js';

const VERSION = '0.1.0';
/** How long the consumer blocks waiting for new messages before looping. */
const CONSUMER_BLOCK_MS = 5_000;

/** Worker entrypoint. */
async function main(): Promise<void> {
  const common = loadCommonConfig();
  const logger = createLogger({
    level: common.logLevel,
    pretty: !common.isProduction,
    base: { service: 'worker' },
  });

  const workerConfig = loadWorkerConfig();
  const regionCode = process.env.PROBE_REGION ?? 'local';

  const db = new Database(loadDatabaseConfig(), logger);
  const redisConfig = loadRedisConfig();
  // Separate clients: one blocks on XREADGROUP, the other issues acks/writes.
  const readClient = createRedis(redisConfig);
  const controlClient = createRedis(redisConfig);

  // Resolve which region this worker probes from.
  const region = await new InfraRepository(db).findRegionByCode(regionCode);
  if (!region) {
    throw new Error(`Unknown probe region "${regionCode}". Seed it in probe_regions first.`);
  }
  if (!region.enabled) {
    throw new Error(`Probe region "${regionCode}" is disabled.`);
  }

  const instance = `${hostname()}:${process.pid}`;
  const buffer = new ResultBuffer();
  const results = new ResultsRepository(db);
  const queue = new RedisCheckQueue(controlClient, workerConfig.queueStream, workerConfig.queueGroup);
  const eventBus = new RedisEventBus(controlClient);
  const processor = new JobProcessor(
    createDefaultRegistry(),
    buffer,
    new StatusEvaluator(db),
    eventBus,
    logger,
  );
  const flusher = new BufferFlusher(results, buffer, logger);

  await queue.ensureGroup(region.id);

  const consumer = createCheckConsumer({
    readClient,
    controlClient,
    stream: queue.streamKey(region.id),
    group: workerConfig.queueGroup,
    consumerName: instance,
    count: workerConfig.concurrency,
    blockMs: CONSUMER_BLOCK_MS,
    logger,
    onJob: async (job) => {
      await processor.process(job);
      // Size-based flush trigger complements the periodic timer.
      if (buffer.size >= workerConfig.flushMaxRows) await flusher.flush();
    },
  });

  const worker = new Worker({
    consumer,
    flusher,
    infra: new InfraRepository(db),
    regionId: region.id,
    instance,
    version: VERSION,
    flushIntervalMs: workerConfig.flushIntervalMs,
    logger,
  });

  await worker.start();
  logger.info({ region: region.code, instance }, 'worker online');

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down worker');
    await worker.stop();
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

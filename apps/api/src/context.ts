import {
  type ApiConfig,
  type CommonConfig,
  type Logger,
  createLogger,
  loadApiConfig,
  loadCommonConfig,
  loadDatabaseConfig,
  loadRedisConfig,
} from '@ping/config';
import { Database } from '@ping/db';
import { createRedis } from '@ping/queue';
import { WsHub, startEventBroadcaster } from './ws/hub.js';
import { TokenService } from './auth/tokens.js';
import { ApiKeyService } from './services/api-key-service.js';
import { AuthService } from './services/auth-service.js';
import { ChannelService } from './services/channel-service.js';
import { GroupService } from './services/group-service.js';
import { InfraService } from './services/infra-service.js';
import { MonitorService } from './services/monitor-service.js';
import { StatsService } from './services/stats-service.js';
import { StatusPageService } from './services/status-page-service.js';
import { TagService } from './services/tag-service.js';

/**
 * Application composition root. Wires configuration, infrastructure clients and
 * services once at startup; routes receive this fully-constructed context and
 * never instantiate their own dependencies (explicit dependency injection).
 */
export interface AppContext {
  readonly apiConfig: ApiConfig;
  readonly commonConfig: CommonConfig;
  readonly logger: Logger;
  readonly db: Database;
  readonly tokens: TokenService;
  readonly auth: AuthService;
  readonly monitors: MonitorService;
  readonly stats: StatsService;
  readonly infra: InfraService;
  readonly channels: ChannelService;
  readonly groups: GroupService;
  readonly statusPages: StatusPageService;
  readonly tags: TagService;
  readonly apiKeys: ApiKeyService;
  readonly wsHub: WsHub;
  close(): Promise<void>;
}

export function buildContext(): AppContext {
  const commonConfig = loadCommonConfig();
  const apiConfig = loadApiConfig();
  const logger = createLogger({
    level: commonConfig.logLevel,
    pretty: !commonConfig.isProduction,
    base: { service: 'api' },
  });

  const db = new Database(loadDatabaseConfig(), logger);
  const tokens = new TokenService(
    apiConfig.jwtSecret,
    apiConfig.jwtAccessTtl,
    apiConfig.jwtRefreshTtl,
  );

  // Real-time event fan-out to WebSocket clients.
  const wsRedis = createRedis(loadRedisConfig());
  const wsHub = new WsHub();
  const stopBroadcaster = startEventBroadcaster(wsRedis, wsHub, 'events:monitor', logger);

  return {
    apiConfig,
    commonConfig,
    logger,
    db,
    tokens,
    auth: new AuthService(db, tokens),
    monitors: new MonitorService(db),
    stats: new StatsService(db),
    infra: new InfraService(db),
    channels: new ChannelService(db),
    groups: new GroupService(db),
    statusPages: new StatusPageService(db),
    tags: new TagService(db),
    apiKeys: new ApiKeyService(db),
    wsHub,
    async close(): Promise<void> {
      stopBroadcaster();
      wsRedis.disconnect();
      await db.close();
    },
  };
}

import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';
import type { WsSocket } from './ws/hub.js';

/** Max concurrent WebSocket connections per workspace (per process). */
const WS_MAX_PER_WORKSPACE = 50;
/** Heartbeat interval; unresponsive sockets are terminated. */
const WS_HEARTBEAT_MS = 30_000;

/** Build a fully-configured Fastify instance for the given context. */
export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // we use our own pino logger via ctx
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
  });

  app.decorate('ctx', ctx);
  registerErrorHandler(app, ctx);

  // Security headers (API returns JSON only, so CSP is not needed here).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Global rate limit (per client IP). Auth routes tighten this further.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    hook: 'onRequest',
  });

  await app.register(cors, {
    origin: ctx.apiConfig.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(websocket);

  await app.register(
    (instance, _opts, done) => {
      registerRoutes(instance, ctx);

      // Real-time event stream. Auth via API key, sent either as the WebSocket
      // subprotocol (preferred — never logged in URLs) or a ?apiKey= param.
      instance.get('/ws', { websocket: true }, (socket, request) => {
        const ws = socket as unknown as WsSocket;
        const proto = request.headers['sec-websocket-protocol'];
        const fromProto = typeof proto === 'string' ? proto.split(',')[0]?.trim() : undefined;
        const key = fromProto || (request.query as { apiKey?: string }).apiKey || '';

        void ctx.apiKeys.verify(key, request.ip).then((auth) => {
          if (!auth) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or missing API key' }));
            ws.close();
            return;
          }
          if (ctx.wsHub.count(auth.workspacePublicId) >= WS_MAX_PER_WORKSPACE) {
            ws.send(JSON.stringify({ type: 'error', message: 'Too many connections' }));
            ws.close();
            return;
          }

          ctx.wsHub.add(auth.workspacePublicId, ws);
          ws.send(JSON.stringify({ type: 'connected', workspaceId: auth.workspacePublicId }));

          // Heartbeat: drop connections that stop responding to pings.
          let alive = true;
          ws.on('pong', () => {
            alive = true;
          });
          const heartbeat = setInterval(() => {
            if (!alive) {
              ws.terminate();
              return;
            }
            alive = false;
            try {
              ws.ping();
            } catch {
              /* ignore */
            }
          }, WS_HEARTBEAT_MS);

          ws.on('close', () => {
            clearInterval(heartbeat);
            ctx.wsHub.remove(auth.workspacePublicId, ws);
          });
        });
      });
      done();
    },
    { prefix: '/api' },
  );

  return app;
}

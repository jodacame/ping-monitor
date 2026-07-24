import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';
import type { WsSocket } from './ws/hub.js';

/** Build a fully-configured Fastify instance for the given context. */
export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // we use our own pino logger via ctx
    trustProxy: true,
    bodyLimit: 1_048_576, // 1 MiB
  });

  app.decorate('ctx', ctx);
  registerErrorHandler(app, ctx);

  await app.register(cors, {
    origin: ctx.apiConfig.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(websocket);

  await app.register(
    (instance, _opts, done) => {
      registerRoutes(instance, ctx);

      // Real-time event stream, authenticated by API key (?apiKey=pk_...).
      instance.get('/ws', { websocket: true }, (socket, request) => {
        const ws = socket as unknown as WsSocket;
        const apiKey = (request.query as { apiKey?: string }).apiKey ?? '';
        void ctx.apiKeys.verify(apiKey).then((auth) => {
          if (!auth) {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid or missing API key' }));
            ws.close();
            return;
          }
          ctx.wsHub.add(auth.workspacePublicId, ws);
          ws.send(JSON.stringify({ type: 'connected', workspaceId: auth.workspacePublicId }));
          ws.on('close', () => ctx.wsHub.remove(auth.workspacePublicId, ws));
        });
      });
      done();
    },
    { prefix: '/api' },
  );

  return app;
}

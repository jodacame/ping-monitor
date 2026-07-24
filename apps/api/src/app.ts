import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';

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

  await app.register(
    (instance, _opts, done) => {
      registerRoutes(instance, ctx);
      done();
    },
    { prefix: '/api' },
  );

  return app;
}

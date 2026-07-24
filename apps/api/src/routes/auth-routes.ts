import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { loginSchema, refreshSchema, registerSchema } from './schemas.js';

/** Authentication endpoints: register, login, refresh, logout, me. */
export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  app.post('/auth/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await ctx.auth.register(body, request.headers['user-agent'] ?? null);
    void reply.status(201);
    return result;
  });

  app.post('/auth/login', async (request) => {
    const body = loginSchema.parse(request.body);
    return ctx.auth.login(body, request.headers['user-agent'] ?? null);
  });

  app.post('/auth/refresh', async (request) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    return ctx.auth.refresh(refreshToken, request.headers['user-agent'] ?? null);
  });

  app.post('/auth/logout', async (request) => {
    const { refreshToken } = refreshSchema.parse(request.body);
    await ctx.auth.logout(refreshToken);
    return { ok: true };
  });

  app.get('/auth/me', { preHandler: [guards.authenticate] }, async (request) => {
    return ctx.auth.me(request.authUser!.userId);
  });
}

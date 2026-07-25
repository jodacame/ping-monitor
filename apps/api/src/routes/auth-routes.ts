import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { changePasswordSchema, loginSchema, refreshSchema, registerSchema } from './schemas.js';

/** Authentication endpoints: register, login, refresh, logout, me. */
export function registerAuthRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  // Tighter rate limits on credential endpoints (anti brute-force).
  const authLimit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  // Public: lets the SPA decide between onboarding, login-only, or open register.
  app.get('/auth/registration', async () => {
    return ctx.auth.registrationStatus();
  });

  app.post('/auth/register', authLimit, async (request, reply) => {
    const body = registerSchema.parse(request.body);
    const result = await ctx.auth.register(body, request.headers['user-agent'] ?? null);
    void reply.status(201);
    return result;
  });

  app.post('/auth/login', authLimit, async (request) => {
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

  // Both endpoints act on a person, not a workspace: an API key has no user
  // behind it, so `requireUser` turns that into a 403 instead of a 500.
  app.get('/auth/me', { preHandler: [guards.authenticate, guards.requireUser] }, async (request) => {
    return ctx.auth.me(request.authUser!.userId);
  });

  app.post(
    '/auth/change-password',
    { preHandler: [guards.authenticate, guards.requireUser], ...authLimit },
    async (request) => {
      const { currentPassword, newPassword } = changePasswordSchema.parse(request.body);
      return ctx.auth.changePassword(
        request.authUser!.userId,
        currentPassword,
        newPassword,
        request.headers['user-agent'] ?? null,
      );
    },
  );
}

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

  /**
   * Who is calling, for either kind of credential.
   *
   * An integration is handed an API key and nothing else, and every workspace
   * endpoint needs a workspace id. `/auth/me` and `/workspaces` are user-only,
   * so without this a key holder had no supported way to discover their own
   * workspace — the only hint was the WebSocket handshake.
   */
  app.get('/auth/whoami', { preHandler: [guards.authenticate] }, async (request) => {
    if (request.apiKey) {
      const key = request.apiKey;
      // Only what the holder needs to operate, and nothing that identifies the
      // key row itself: the caller already has the credential, so this must not
      // become a way to learn anything extra about the workspace or its keys.
      return {
        principal: 'api_key' as const,
        workspaceId: key.workspacePublicId,
        scopes: key.scopes,
        expiresAt: key.expiresAt,
      };
    }
    const { user, workspaces } = await ctx.auth.me(request.authUser!.userId);
    return { principal: 'user' as const, user, workspaces };
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

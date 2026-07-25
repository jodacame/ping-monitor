import type { FastifyInstance } from 'fastify';
import { WorkspaceRepository } from '@ping/db';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { createWorkspaceSchema } from './schemas.js';

/** Health checks, workspace listing and region metadata. */
export function registerMiscRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  // Liveness: process is up.
  app.get('/health', () => ({ status: 'ok' }));

  // Readiness: dependencies reachable.
  app.get('/health/ready', async (_request, reply) => {
    const ok = await ctx.db.healthCheck().catch(() => false);
    if (!ok) {
      void reply.status(503);
      return { status: 'unavailable' };
    }
    return { status: 'ready' };
  });

  // Workspace listing/creation is per-user, so an API key (which is bound to a
  // single workspace) is rejected with 403 rather than dereferencing a missing
  // user.
  app.get(
    '/workspaces',
    { preHandler: [guards.authenticate, guards.requireUser] },
    async (request) => {
      const memberships = await new WorkspaceRepository(ctx.db).listForUser(
        request.authUser!.userId,
      );
      return memberships.map((w) => ({ id: w.publicId, name: w.name, slug: w.slug, role: w.role }));
    },
  );

  app.post('/workspaces', { preHandler: [guards.authenticate, guards.requireUser] }, async (request, reply) => {
    const { name } = createWorkspaceSchema.parse(request.body);
    void reply.status(201);
    return ctx.auth.createWorkspace(request.authUser!.userId, name);
  });

  app.get('/regions', { preHandler: [guards.authenticate] }, async () => {
    return ctx.infra.listRegions();
  });
}

import type { FastifyInstance } from 'fastify';
import { WorkspaceRepository } from '@ping/db';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';

/** Health checks, workspace listing and region metadata. */
export function registerMiscRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  // Liveness: process is up.
  app.get('/health', async () => ({ status: 'ok' }));

  // Readiness: dependencies reachable.
  app.get('/health/ready', async (_request, reply) => {
    const ok = await ctx.db.healthCheck().catch(() => false);
    if (!ok) {
      void reply.status(503);
      return { status: 'unavailable' };
    }
    return { status: 'ready' };
  });

  app.get('/workspaces', { preHandler: [guards.authenticate] }, async (request) => {
    const memberships = await new WorkspaceRepository(ctx.db).listForUser(request.authUser!.userId);
    return memberships.map((w) => ({ id: w.publicId, name: w.name, slug: w.slug, role: w.role }));
  });

  app.get('/regions', { preHandler: [guards.authenticate] }, async () => {
    return ctx.infra.listRegions();
  });
}

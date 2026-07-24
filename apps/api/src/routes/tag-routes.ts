import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { createTagSchema } from './schemas.js';

/** Tag CRUD, scoped to a workspace. */
export function registerTagRoutes(app: FastifyInstance, ctx: AppContext, guards: AuthGuards): void {
  const preHandler = [guards.authenticate, guards.resolveWorkspace];
  const base = '/workspaces/:workspaceId/tags';

  app.get(base, { preHandler }, async (request) => {
    return ctx.tags.list(request.workspace!.id);
  });

  app.post(base, { preHandler }, async (request, reply) => {
    const body = createTagSchema.parse(request.body);
    void reply.status(201);
    return ctx.tags.create(request.workspace!.id, body.name, body.color);
  });

  app.delete(`${base}/:tagId`, { preHandler }, async (request, reply) => {
    const { tagId } = request.params as { workspaceId: string; tagId: string };
    await ctx.tags.delete(request.workspace!.id, tagId);
    void reply.status(204);
  });
}

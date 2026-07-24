import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { groupToDto } from '../services/group-service.js';
import { createGroupSchema, updateGroupSchema } from './schemas.js';

interface GroupParams {
  workspaceId: string;
  groupId: string;
}

/** Monitor-group (folder) CRUD, scoped to a workspace. */
export function registerGroupRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  const preHandler = [guards.authenticate, guards.resolveWorkspace];
  const base = '/workspaces/:workspaceId/groups';

  app.get(base, { preHandler }, async (request) => {
    const groups = await ctx.groups.list(request.workspace!.id);
    return groups.map(groupToDto);
  });

  app.post(base, { preHandler }, async (request, reply) => {
    const body = createGroupSchema.parse(request.body);
    const group = await ctx.groups.create(request.workspace!.id, body);
    void reply.status(201);
    return groupToDto(group);
  });

  app.patch(`${base}/:groupId`, { preHandler }, async (request) => {
    const { groupId } = request.params as GroupParams;
    const body = updateGroupSchema.parse(request.body);
    return groupToDto(await ctx.groups.update(request.workspace!.id, groupId, body));
  });

  app.delete(`${base}/:groupId`, { preHandler }, async (request, reply) => {
    const { groupId } = request.params as GroupParams;
    await ctx.groups.delete(request.workspace!.id, groupId);
    void reply.status(204);
  });
}

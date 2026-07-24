import type { FastifyInstance } from 'fastify';
import type { ConnectorType } from '@ping/notifications';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { channelToDto } from '../services/channel-service.js';
import { createChannelSchema, updateChannelSchema } from './schemas.js';

interface ChannelParams {
  workspaceId: string;
  channelId: string;
}

/** Notification-channel CRUD + test, scoped to a workspace. */
export function registerChannelRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  const preHandler = [guards.authenticate, guards.resolveWorkspace];
  const base = '/workspaces/:workspaceId/channels';

  app.get(base, { preHandler }, async (request) => {
    const channels = await ctx.channels.list(request.workspace!.id);
    return channels.map(channelToDto);
  });

  app.post(base, { preHandler }, async (request, reply) => {
    const body = createChannelSchema.parse(request.body);
    const channel = await ctx.channels.create(request.workspace!.id, {
      type: body.type as ConnectorType,
      name: body.name,
      config: body.config,
      ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
    });
    void reply.status(201);
    return channelToDto(channel);
  });

  app.get(`${base}/:channelId`, { preHandler }, async (request) => {
    const { channelId } = request.params as ChannelParams;
    return channelToDto(await ctx.channels.get(request.workspace!.id, channelId));
  });

  app.patch(`${base}/:channelId`, { preHandler }, async (request) => {
    const { channelId } = request.params as ChannelParams;
    const body = updateChannelSchema.parse(request.body);
    return channelToDto(await ctx.channels.update(request.workspace!.id, channelId, body));
  });

  app.delete(`${base}/:channelId`, { preHandler }, async (request, reply) => {
    const { channelId } = request.params as ChannelParams;
    await ctx.channels.delete(request.workspace!.id, channelId);
    void reply.status(204);
  });

  app.post(`${base}/:channelId/test`, { preHandler }, async (request) => {
    const { channelId } = request.params as ChannelParams;
    return ctx.channels.test(request.workspace!.id, channelId);
  });
}

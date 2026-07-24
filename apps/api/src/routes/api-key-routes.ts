import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { apiKeyToDto } from '../services/api-key-service.js';
import { createApiKeySchema } from './schemas.js';

/** Developer API key management. Restricted to signed-in users (not API keys). */
export function registerApiKeyRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  const preHandler = [guards.authenticate, guards.resolveWorkspace, guards.requireUser];
  const base = '/workspaces/:workspaceId/api-keys';

  app.get(base, { preHandler }, async (request) => {
    const keys = await ctx.apiKeys.list(request.workspace!.id);
    return keys.map(apiKeyToDto);
  });

  app.post(base, { preHandler }, async (request, reply) => {
    const { name } = createApiKeySchema.parse(request.body);
    const { record, key } = await ctx.apiKeys.create(request.workspace!.id, name);
    void reply.status(201);
    // The full key is returned exactly once.
    return { ...apiKeyToDto(record), key };
  });

  app.delete(`${base}/:keyId`, { preHandler }, async (request, reply) => {
    const { keyId } = request.params as { workspaceId: string; keyId: string };
    await ctx.apiKeys.revoke(request.workspace!.id, keyId);
    void reply.status(204);
  });
}

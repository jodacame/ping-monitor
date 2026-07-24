import type { FastifyInstance } from 'fastify';
import { NotFoundError } from '@ping/core';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { statusPageToDto } from '../services/status-page-service.js';
import { createStatusPageSchema, updateStatusPageSchema } from './schemas.js';

interface Params {
  workspaceId: string;
  pageId: string;
}

/** Status-page management (auth) + the public read endpoint (no auth). */
export function registerStatusPageRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  const preHandler = [guards.authenticate, guards.resolveWorkspace];
  const base = '/workspaces/:workspaceId/status-pages';

  app.get(base, { preHandler }, async (request) => {
    const pages = await ctx.statusPages.list(request.workspace!.id);
    return pages.map((p) => ({
      id: p.publicId,
      slug: p.slug,
      title: p.title,
      description: p.description,
      updatedAt: p.updatedAt,
    }));
  });

  app.post(base, { preHandler }, async (request, reply) => {
    const body = createStatusPageSchema.parse(request.body);
    const page = await ctx.statusPages.create(request.workspace!.id, body);
    void reply.status(201);
    return statusPageToDto(page);
  });

  app.get(`${base}/:pageId`, { preHandler }, async (request) => {
    const { pageId } = request.params as Params;
    return statusPageToDto(await ctx.statusPages.get(request.workspace!.id, pageId));
  });

  app.patch(`${base}/:pageId`, { preHandler }, async (request) => {
    const { pageId } = request.params as Params;
    const body = updateStatusPageSchema.parse(request.body);
    return statusPageToDto(await ctx.statusPages.update(request.workspace!.id, pageId, body));
  });

  app.delete(`${base}/:pageId`, { preHandler }, async (request, reply) => {
    const { pageId } = request.params as Params;
    await ctx.statusPages.delete(request.workspace!.id, pageId);
    void reply.status(204);
  });

  // Public, unauthenticated read view.
  app.get('/public/status/:slug', async (request) => {
    const { slug } = request.params as { slug: string };
    const page = await ctx.statusPages.getPublic(slug);
    if (!page) throw new NotFoundError('Status page not found');
    return page;
  });
}

import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { createAuthGuards } from '../plugins/auth-guards.js';
import { registerAuthRoutes } from './auth-routes.js';
import { registerChannelRoutes } from './channel-routes.js';
import { registerGroupRoutes } from './group-routes.js';
import { registerMiscRoutes } from './misc-routes.js';
import { registerMonitorRoutes } from './monitor-routes.js';

/** Register every route group under the given app (already prefixed with /api). */
export function registerRoutes(app: FastifyInstance, ctx: AppContext): void {
  const guards = createAuthGuards(ctx);
  registerMiscRoutes(app, ctx, guards);
  registerAuthRoutes(app, ctx, guards);
  registerMonitorRoutes(app, ctx, guards);
  registerChannelRoutes(app, ctx, guards);
  registerGroupRoutes(app, ctx, guards);
}

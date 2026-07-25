import type { FastifyInstance } from 'fastify';
import { ValidationError } from '@ping/core';
import type { ListMonitorsFilter } from '@ping/db';
import type { AppContext } from '../context.js';
import type { AuthGuards } from '../plugins/auth-guards.js';
import { monitorToDto } from './serializers.js';
import {
  createMonitorSchema,
  listMonitorsQuerySchema,
  recentChecksQuerySchema,
  statsQuerySchema,
  updateMonitorSchema,
} from './schemas.js';

interface MonitorParams {
  workspaceId: string;
  monitorId: string;
}

/**
 * Monitor CRUD plus nested statistics, all scoped to a workspace the caller is
 * a member of (`authenticate` + `resolveWorkspace` guards).
 */
export function registerMonitorRoutes(
  app: FastifyInstance,
  ctx: AppContext,
  guards: AuthGuards,
): void {
  const preHandler = [guards.authenticate, guards.resolveWorkspace];
  const base = '/workspaces/:workspaceId';

  app.get(`${base}/overview`, { preHandler }, async (request) => {
    return ctx.stats.workspaceOverview(request.workspace!.id);
  });

  app.get(`${base}/insights`, { preHandler }, async (request) => {
    // Insights are always the last 24 hours — `incidents24h` says so in its very
    // name. Accepting a `window` and quietly ignoring it left callers believing
    // they were reading a different period, so say no instead. Other query
    // parameters are left alone; cache-busting suffixes are common and harmless.
    if ((request.query as { window?: string }).window !== undefined) {
      throw new ValidationError(
        'Insights always cover the last 24 hours and take no window. Use /monitors/{monitorId}/stats?window= for other periods.',
      );
    }
    return ctx.stats.workspaceInsights(request.workspace!.id);
  });

  app.get(`${base}/monitors`, { preHandler }, async (request) => {
    const q = listMonitorsQuerySchema.parse(request.query);
    const filter: ListMonitorsFilter = {
      workspaceId: request.workspace!.id,
      limit: q.pageSize,
      offset: (q.page - 1) * q.pageSize,
      ...(q.status ? { status: q.status } : {}),
      ...(q.search ? { search: q.search } : {}),
      ...(q.tagId ? { tagId: q.tagId } : {}),
    };
    const { items, total } = await ctx.monitors.list(filter);
    // Enrich each row with 24h uptime + heartbeat bars in one bounded query.
    const stats = await ctx.stats.miniStats(items.map((m) => m.id));
    const enriched = items.map((m) => {
      const s = stats.get(m.id);
      return { ...monitorToDto(m), uptime24h: s?.uptime24h ?? null, bars: s?.bars ?? [] };
    });
    return { items: enriched, page: q.page, pageSize: q.pageSize, total };
  });

  app.post(`${base}/monitors`, { preHandler }, async (request, reply) => {
    const body = createMonitorSchema.parse(request.body);
    const monitor = await ctx.monitors.create(request.workspace!.id, body);
    void reply.status(201);
    return monitorToDto(monitor);
  });

  app.get(`${base}/monitors/:monitorId`, { preHandler }, async (request) => {
    const { monitorId } = request.params as MonitorParams;
    return monitorToDto(await ctx.monitors.get(request.workspace!.id, monitorId));
  });

  app.patch(`${base}/monitors/:monitorId`, { preHandler }, async (request) => {
    const { monitorId } = request.params as MonitorParams;
    const body = updateMonitorSchema.parse(request.body);
    return monitorToDto(await ctx.monitors.update(request.workspace!.id, monitorId, body));
  });

  app.delete(`${base}/monitors/:monitorId`, { preHandler }, async (request, reply) => {
    const { monitorId } = request.params as MonitorParams;
    await ctx.monitors.delete(request.workspace!.id, monitorId);
    void reply.status(204);
  });

  app.post(`${base}/monitors/:monitorId/pause`, { preHandler }, async (request) => {
    const { monitorId } = request.params as MonitorParams;
    await ctx.monitors.setPaused(request.workspace!.id, monitorId, true);
    return { ok: true };
  });

  app.post(`${base}/monitors/:monitorId/resume`, { preHandler }, async (request) => {
    const { monitorId } = request.params as MonitorParams;
    await ctx.monitors.setPaused(request.workspace!.id, monitorId, false);
    return { ok: true };
  });

  // --- statistics ------------------------------------------------------------

  app.get(`${base}/monitors/:monitorId/stats`, { preHandler }, async (request) => {
    const { monitorId } = request.params as MonitorParams;
    const { window } = statsQuerySchema.parse(request.query);
    const monitor = await ctx.monitors.get(request.workspace!.id, monitorId);
    const [summary, series] = await Promise.all([
      ctx.stats.summary(monitor.id, window),
      ctx.stats.series(monitor.id, window),
    ]);
    return { window, summary, series };
  });

  app.get(`${base}/monitors/:monitorId/checks`, { preHandler }, async (request) => {
    const { monitorId } = request.params as MonitorParams;
    const { limit } = recentChecksQuerySchema.parse(request.query);
    const monitor = await ctx.monitors.get(request.workspace!.id, monitorId);
    return ctx.stats.recentChecks(monitor.id, limit);
  });

  app.get(`${base}/monitors/:monitorId/incidents`, { preHandler }, async (request) => {
    const { monitorId } = request.params as MonitorParams;
    const { limit } = recentChecksQuerySchema.parse(request.query);
    const monitor = await ctx.monitors.get(request.workspace!.id, monitorId);
    return ctx.stats.incidents(monitor.id, limit);
  });

  // CSV export of check history.
  app.get(`${base}/monitors/:monitorId/export.csv`, { preHandler }, async (request, reply) => {
    const { monitorId } = request.params as MonitorParams;
    const monitor = await ctx.monitors.get(request.workspace!.id, monitorId);
    const checks = await ctx.stats.recentChecks(monitor.id, 5000);

    const escape = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = ['checked_at,region,status,response_ms,status_code,error'];
    for (const c of checks) {
      lines.push(
        [
          c.checkedAt.toISOString(),
          String(c.regionId),
          c.up ? 'up' : 'down',
          c.responseMs === null ? '' : String(c.responseMs),
          c.statusCode === null ? '' : String(c.statusCode),
          c.errorKind ?? '',
        ]
          .map(escape)
          .join(','),
      );
    }

    const filename = `${monitor.name.replace(/[^a-z0-9]+/gi, '_')}_checks.csv`;
    void reply
      .header('content-type', 'text/csv; charset=utf-8')
      .header('content-disposition', `attachment; filename="${filename}"`);
    return lines.join('\n');
  });
}

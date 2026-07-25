import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';
import type { AppContext } from '../src/context.js';
import { buildOpenApiDocument } from '../src/docs/openapi.js';
import { registerRoutes } from '../src/routes/index.js';

/**
 * The guarantee that makes the OpenAPI document trustworthy: it is compared
 * against the routes Fastify actually registers. Add a route without describing
 * it (or describe one that no longer exists) and this fails.
 *
 * Route registration only closes over the context, it never calls into it, so a
 * stub is enough to enumerate the route table without a database or Redis.
 */
function collectRoutes(): Set<string> {
  const app = Fastify();
  const found = new Set<string>();
  app.addHook('onRoute', (route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    for (const method of methods) {
      if (method === 'HEAD' || method === 'OPTIONS') continue;
      // Fastify style (`:id`) -> OpenAPI style (`{id}`).
      const path = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      found.add(`${method.toUpperCase()} ${path}`);
    }
  });
  registerRoutes(app, {} as AppContext);
  return found;
}

/** Operations described by the document, as `METHOD /path`. */
function documentedOperations(): Set<string> {
  const document = buildOpenApiDocument('test') as {
    paths: Record<string, Record<string, unknown>>;
  };
  const described = new Set<string>();
  for (const [path, operations] of Object.entries(document.paths)) {
    for (const method of Object.keys(operations)) {
      if (['parameters', 'summary', 'description'].includes(method)) continue;
      described.add(`${method.toUpperCase()} ${path}`);
    }
  }
  return described;
}

describe('OpenAPI document', () => {
  const registered = collectRoutes();
  const documented = documentedOperations();

  it('describes every registered route', () => {
    const missing = [...registered].filter((r) => !documented.has(r)).sort();
    expect(missing, `Routes missing from docs/openapi.ts:\n${missing.join('\n')}`).toEqual([]);
  });

  it('describes no route that does not exist', () => {
    const extra = [...documented].filter((d) => !registered.has(d)).sort();
    expect(extra, `Documented but not registered:\n${extra.join('\n')}`).toEqual([]);
  });

  it('covers a meaningful number of routes (guards against an empty comparison)', () => {
    expect(registered.size).toBeGreaterThan(30);
  });

  it('is a valid-looking OpenAPI 3 document', () => {
    const document = buildOpenApiDocument('9.9.9') as Record<string, unknown>;
    expect(document.openapi).toBe('3.0.3');
    expect((document.info as { version: string }).version).toBe('9.9.9');
    expect(document.servers).toEqual([{ url: '/api', description: 'This instance' }]);
  });

  it('documents the rate-limit headers, since clients must react to them', () => {
    const description = (buildOpenApiDocument('test').info as { description: string }).description;
    for (const header of [
      'x-ratelimit-limit',
      'x-ratelimit-remaining',
      'x-ratelimit-reset',
      'retry-after',
    ]) {
      expect(description).toContain(header);
    }
  });

  it('states that the WebSocket rejects a user token', () => {
    const description = (buildOpenApiDocument('test').info as { description: string }).description;
    expect(description).toContain('a user access token is rejected');
  });

  it('resolves every $ref used by an operation', () => {
    const document = buildOpenApiDocument('test');
    const schemas = (document.components as { schemas: Record<string, unknown> }).schemas;
    const refs = new Set<string>();
    const walk = (node: unknown): void => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach(walk);
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === '$ref' && typeof value === 'string') refs.add(value.replace('#/components/schemas/', ''));
        else walk(value);
      }
    };
    walk(document.paths);
    walk(schemas);
    const dangling = [...refs].filter((name) => !(name in schemas));
    expect(dangling, `Dangling $refs: ${dangling.join(', ')}`).toEqual([]);
  });
});

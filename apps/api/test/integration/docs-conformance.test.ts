import { beforeAll, describe, expect, it } from 'vitest';
import { call, createKey, firstWorkspaceId, live, login, runId } from './helpers.js';

/**
 * Asserts the claims the documentation makes, against the running server.
 *
 * The generated OpenAPI document is checked for route coverage by the unit test
 * `test/openapi.test.ts`; this suite covers the promises prose makes and a
 * generated reference cannot: response shapes, accepted values, and the
 * behaviour a developer is told to expect.
 */
describe.skipIf(!live)('documentation conformance (integration)', () => {
  let token: string;
  let workspaceId: string;
  let key: string;

  beforeAll(async () => {
    token = await login();
    workspaceId = await firstWorkspaceId(token);
    key = (await createKey(token, workspaceId, { name: `it-docs-${runId}`, scopes: ['read', 'write'] })).key;
  });

  describe('the documented getting-started path', () => {
    it('returns a session with the documented fields', async () => {
      const res = await call<Record<string, unknown>>('/auth/login', {
        method: 'POST',
        body: { email: process.env.PING_E2E_EMAIL ?? 'demo@example.com', password: process.env.PING_E2E_PASSWORD ?? 'supersecret' },
      });
      expect(Object.keys(res.json).sort()).toEqual(['accessToken', 'expiresIn', 'refreshToken', 'user']);
    });

    it('exposes the workspace id and role through /workspaces', async () => {
      const res = await call<Array<Record<string, unknown>>>('/workspaces', { token });
      expect(Object.keys(res.json[0]!).sort()).toEqual(['id', 'name', 'role', 'slug']);
    });
  });

  describe('the reference documents itself', () => {
    it('serves the interactive docs', async () => {
      expect((await call('/docs')).status).toBe(200);
    });

    it('serves an OpenAPI 3 document describing this instance', async () => {
      const res = await call<{ openapi: string; servers: Array<{ url: string }> }>('/openapi.json');
      expect(res.status).toBe(200);
      expect(res.json.openapi).toBe('3.0.3');
      expect(res.json.servers[0]?.url).toBe('/api');
    });

    it('describes only operations the router actually serves', async () => {
      const spec = await call<{ paths: Record<string, Record<string, unknown>> }>('/openapi.json');
      const missing: string[] = [];
      for (const [path, operations] of Object.entries(spec.json.paths)) {
        if (path.includes('{')) continue; // parameterised paths are exercised elsewhere
        for (const method of Object.keys(operations)) {
          const res = await call<{ error?: { message?: string } }>(path, {
            method: method.toUpperCase(),
            token,
          });
          if (res.status === 404 && /Route .* not found/.test(res.json?.error?.message ?? '')) {
            missing.push(`${method.toUpperCase()} ${path}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });
  });

  describe('monitors behave as documented', () => {
    it('accepts exactly the four documented check intervals', async () => {
      for (const intervalSeconds of [30, 60, 300, 900]) {
        const res = await call(`/workspaces/${workspaceId}/monitors`, {
          method: 'POST',
          token: key,
          body: { name: `it-i${intervalSeconds}-${runId}`, type: 'http', target: 'https://example.com', intervalSeconds },
        });
        expect(res.status, `${intervalSeconds}s should be accepted`).toBe(201);
      }
    });

    it('rejects any other interval, naming the field', async () => {
      const res = await call<{ error: { code: string; details: Array<{ path: string }> } }>(
        `/workspaces/${workspaceId}/monitors`,
        {
          method: 'POST',
          token: key,
          body: { name: `it-bad-${runId}`, type: 'http', target: 'https://example.com', intervalSeconds: 120 },
        },
      );
      expect(res.status).toBe(400);
      expect(res.json.error.code).toBe('validation_error');
      expect(res.json.error.details[0]?.path).toBe('intervalSeconds');
    });

    it('returns display data in the list and regions in the detail', async () => {
      // Documented explicitly, because the two shapes genuinely differ.
      const created = await call<{ id: string }>(`/workspaces/${workspaceId}/monitors`, {
        method: 'POST',
        token: key,
        body: { name: `it-shape-${runId}`, type: 'http', target: 'https://example.com', intervalSeconds: 60 },
      });
      const list = await call<{ items: Array<Record<string, unknown>> }>(
        `/workspaces/${workspaceId}/monitors?pageSize=100`,
        { token: key },
      );
      const item = list.json.items.find((m) => m.id === created.json.id)!;
      expect(item).toHaveProperty('uptime24h');
      expect(item).toHaveProperty('bars');
      expect(item).not.toHaveProperty('regionIds');

      const detail = await call<Record<string, unknown>>(
        `/workspaces/${workspaceId}/monitors/${created.json.id}`,
        { token: key },
      );
      expect(detail.json).toHaveProperty('regionIds');
    });

    it('pauses and resumes', async () => {
      // Regression: both returned 500 because of a type mismatch in the update.
      const created = await call<{ id: string }>(`/workspaces/${workspaceId}/monitors`, {
        method: 'POST',
        token: key,
        body: { name: `it-pause-${runId}`, type: 'http', target: 'https://example.com', intervalSeconds: 60 },
      });
      const id = created.json.id;
      const detail = async (): Promise<string> =>
        (await call<{ status: string }>(`/workspaces/${workspaceId}/monitors/${id}`, { token: key })).json
          .status;

      // Both endpoints acknowledge rather than return the monitor, so the effect
      // has to be read back from the detail endpoint.
      const paused = await call<{ ok: boolean }>(`/workspaces/${workspaceId}/monitors/${id}/pause`, {
        method: 'POST',
        token: key,
      });
      expect(paused.status).toBe(200);
      expect(paused.json.ok).toBe(true);
      expect(await detail()).toBe('paused');

      const resumed = await call<{ ok: boolean }>(`/workspaces/${workspaceId}/monitors/${id}/resume`, {
        method: 'POST',
        token: key,
      });
      expect(resumed.status).toBe(200);
      expect(resumed.json.ok).toBe(true);
      expect(await detail()).not.toBe('paused');
    });

    it('paginates with the documented envelope', async () => {
      const res = await call<Record<string, unknown>>(`/workspaces/${workspaceId}/monitors?page=1&pageSize=2`, {
        token: key,
      });
      expect(Object.keys(res.json).sort()).toEqual(['items', 'page', 'pageSize', 'total']);
    });
  });

  describe('errors use the documented envelope and codes', () => {
    it('maps each status to its documented code', async () => {
      const notFound = await call<{ error: { code: string } }>(
        `/workspaces/${workspaceId}/monitors/does-not-exist`,
        { token: key },
      );
      expect(notFound.json.error.code).toBe('not_found');

      const unauthorized = await call<{ error: { code: string } }>(`/workspaces/${workspaceId}/monitors`, {
        token: 'pk_bogus',
      });
      expect(unauthorized.json.error.code).toBe('unauthorized');

      const forbidden = await call<{ error: { code: string } }>('/auth/me', { token: key });
      expect(forbidden.json.error.code).toBe('forbidden');
    });
  });

  describe('status pages', () => {
    it('generates a slug and serves the page without authentication', async () => {
      const monitor = await call<{ id: string }>(`/workspaces/${workspaceId}/monitors`, {
        method: 'POST',
        token: key,
        body: { name: `it-sp-${runId}`, type: 'http', target: 'https://example.com', intervalSeconds: 60 },
      });
      const page = await call<{ slug: string }>(`/workspaces/${workspaceId}/status-pages`, {
        method: 'POST',
        token: key,
        body: { title: `It Status ${runId}`, monitorIds: [monitor.json.id] },
      });
      expect(page.json.slug).toBeTruthy();

      const published = await call<Record<string, unknown>>(`/public/status/${page.json.slug}`);
      expect(published.status).toBe(200);
      // The public projection must not leak internal identifiers.
      expect(JSON.stringify(published.json)).not.toContain(monitor.json.id);
    });
  });

  describe('registration state', () => {
    it('is public and reports both documented flags', async () => {
      const res = await call<Record<string, unknown>>('/auth/registration');
      expect(res.status).toBe(200);
      expect(Object.keys(res.json).sort()).toEqual(['needsSetup', 'registrationOpen']);
    });
  });
});

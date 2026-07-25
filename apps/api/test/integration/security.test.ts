import { beforeAll, describe, expect, it } from 'vitest';
import { call, createKey, firstWorkspaceId, firstWsFrame, live, login, runId } from './helpers.js';

/**
 * Security behaviour that only shows up against a running server: credential
 * handling, tenant isolation, and the controls that silently stop applying when
 * they break (IP allowlist, rate limiting, secret redaction).
 */
describe.skipIf(!live)('security (integration)', () => {
  let token: string;
  let workspaceId: string;
  let rwKey: string;
  let roKey: string;

  beforeAll(async () => {
    token = await login();
    workspaceId = await firstWorkspaceId(token);
    rwKey = (await createKey(token, workspaceId, { name: `it-rw-${runId}`, scopes: ['read', 'write'] })).key;
    roKey = (await createKey(token, workspaceId, { name: `it-ro-${runId}`, scopes: ['read'] })).key;
  });

  describe('authentication', () => {
    it('rejects a missing or malformed token', async () => {
      expect((await call(`/workspaces/${workspaceId}/monitors`)).status).toBe(401);
      expect((await call(`/workspaces/${workspaceId}/monitors`, { token: 'pk_nope' })).status).toBe(401);
    });

    it('accepts both an API key and a user token on workspace endpoints', async () => {
      expect((await call(`/workspaces/${workspaceId}/monitors`, { token: rwKey })).status).toBe(200);
      expect((await call(`/workspaces/${workspaceId}/monitors`, { token })).status).toBe(200);
    });

    it('refuses an API key on user-only endpoints with 403, never a 500', async () => {
      // Regression: these used to dereference a missing user and return 500.
      for (const [path, options] of [
        ['/auth/me', {}],
        ['/workspaces', {}],
        [`/workspaces/${workspaceId}/api-keys`, {}],
        [
          '/auth/change-password',
          { method: 'POST', body: { currentPassword: 'x', newPassword: 'yyyyyyyy' } },
        ],
      ] as const) {
        const res = await call(path, { token: rwKey, ...options });
        expect(res.status, `${path} should be 403`).toBe(403);
      }
    });
  });

  describe('scopes', () => {
    it('lets a read-only key read', async () => {
      expect((await call(`/workspaces/${workspaceId}/monitors`, { token: roKey })).status).toBe(200);
    });

    it('blocks every mutating method for a read-only key', async () => {
      const res = await call(`/workspaces/${workspaceId}/monitors`, {
        method: 'POST',
        token: roKey,
        body: { name: 'nope', type: 'http', target: 'https://example.com', intervalSeconds: 60 },
      });
      expect(res.status).toBe(403);
    });
  });

  describe('tenant isolation', () => {
    it('refuses a key against any other workspace, existing or not', async () => {
      const res = await call('/workspaces/some-other-workspace/monitors', { token: rwKey });
      expect(res.status).toBe(403);
    });
  });

  describe('IP allowlist', () => {
    it('cannot be bypassed with a forged X-Forwarded-For', async () => {
      // The whole point of the control: a caller must not be able to claim an
      // allowed address just by sending a header.
      const pinned = await createKey(token, workspaceId, {
        name: `it-pinned-${runId}`,
        scopes: ['read'],
        allowedIps: ['203.0.113.9'],
      });
      const direct = await call(`/workspaces/${workspaceId}/monitors`, { token: pinned.key });
      expect(direct.status, 'a pinned key must not work from another address').toBe(401);

      const spoofed = await call(`/workspaces/${workspaceId}/monitors`, {
        token: pinned.key,
        headers: { 'x-forwarded-for': '203.0.113.9' },
      });

      // If the instance is configured to trust this test runner as a proxy
      // (TRUST_PROXY >= 1 with nothing actually in front), then honouring the
      // header is correct behaviour and there is nothing to assert here. Say so
      // loudly rather than reporting a pass that proves nothing.
      if (spoofed.status === 200) {
        throw new Error(
          'This instance trusts the caller as a proxy, so X-Forwarded-For is honoured by design. ' +
            'Run these tests against an instance with TRUST_PROXY unset to exercise the spoofing guard.',
        );
      }
      expect(spoofed.status, 'forging the client IP must not grant access').toBe(401);
    });

    it('rejects allowlist entries that are not valid addresses or CIDR blocks', async () => {
      // A trailing slash used to be read as /0 and matched every address.
      for (const entry of ['10.0.0.5/', '203.0.113.0/33', 'not-an-ip']) {
        const res = await call(`/workspaces/${workspaceId}/api-keys`, {
          method: 'POST',
          token,
          body: { name: `it-bad-${runId}`, scopes: ['read'], allowedIps: [entry] },
        });
        expect(res.status, `${entry} must be rejected`).toBe(400);
      }
    });
  });

  describe('key lifecycle', () => {
    it('returns the key material exactly once', async () => {
      const created = await createKey(token, workspaceId, { name: `it-once-${runId}`, scopes: ['read'] });
      expect(created.key).toMatch(/^pk_/);
      const list = await call<Array<Record<string, unknown>>>(`/workspaces/${workspaceId}/api-keys`, { token });
      expect(JSON.stringify(list.json)).not.toContain(created.key);
    });

    it('revokes immediately for REST and refuses new WebSocket connections', async () => {
      const doomed = await createKey(token, workspaceId, { name: `it-revoke-${runId}`, scopes: ['read'] });
      expect((await call(`/workspaces/${workspaceId}/monitors`, { token: doomed.key })).status).toBe(200);

      const deleted = await call(`/workspaces/${workspaceId}/api-keys/${doomed.id}`, {
        method: 'DELETE',
        token,
      });
      expect(deleted.status).toBe(204);
      expect((await call(`/workspaces/${workspaceId}/monitors`, { token: doomed.key })).status).toBe(401);
      expect((await firstWsFrame('/ws', [doomed.key])).type).toBe('error');
    });
  });

  describe('WebSocket', () => {
    it('accepts an API key via the subprotocol and scopes the stream to its workspace', async () => {
      const frame = await firstWsFrame('/ws', [rwKey]);
      expect(frame.type).toBe('connected');
      expect(frame.workspaceId).toBe(workspaceId);
    });

    it('refuses a user access token', async () => {
      expect((await firstWsFrame('/ws', [token])).type).toBe('error');
    });

    it('refuses a connection with no credential', async () => {
      expect((await firstWsFrame('/ws')).type).toBe('error');
    });
  });

  describe('secret redaction', () => {
    it('never exposes a channel secret to a read-only key, and a round trip keeps it', async () => {
      const secretTail = `SECRET${runId}`;
      const created = await call<{ id: string; config: Record<string, unknown> }>(
        `/workspaces/${workspaceId}/channels`,
        {
          method: 'POST',
          token,
          body: {
            type: 'webhook',
            name: `it-hook-${runId}`,
            config: { url: `https://hooks.example.com/services/T1/B2/${secretTail}` },
          },
        },
      );
      expect(created.status).toBe(201);

      const read = await call<{ config: Record<string, unknown> }>(
        `/workspaces/${workspaceId}/channels/${created.json.id}`,
        { token: roKey },
      );
      expect(JSON.stringify(read.json)).not.toContain(secretTail);

      // A client that edits a config it fetched sends the mask back; the stored
      // secret must survive that.
      const updated = await call(`/workspaces/${workspaceId}/channels/${created.json.id}`, {
        method: 'PATCH',
        token,
        body: { config: read.json.config },
      });
      expect(updated.status).toBe(200);
      const reread = await call(`/workspaces/${workspaceId}/channels/${created.json.id}`, { token });
      expect(JSON.stringify(reread.json)).not.toContain('••••••/');
    });

    it('does not echo an upstream response body from a channel test', async () => {
      // Otherwise "test this channel" becomes a probe that reads back internal
      // endpoints.
      const created = await call<{ id: string }>(`/workspaces/${workspaceId}/channels`, {
        method: 'POST',
        token,
        body: {
          type: 'webhook',
          name: `it-ssrf-${runId}`,
          config: { url: 'http://127.0.0.1:9/nothing-here' },
        },
      });
      const result = await call<{ ok: boolean; error?: string }>(
        `/workspaces/${workspaceId}/channels/${created.json.id}/test`,
        { method: 'POST', token },
      );
      expect(result.json.ok).toBe(false);
      expect(result.json.error ?? '').not.toMatch(/<html|\{"/i);
    });
  });

  describe('rate limiting', () => {
    it('reports the limit on every response', async () => {
      const res = await call(`/workspaces/${workspaceId}/monitors`, { token: rwKey });
      expect(res.headers.get('x-ratelimit-limit')).toBeTruthy();
      expect(res.headers.get('x-ratelimit-remaining')).toBeTruthy();
      expect(res.headers.get('x-ratelimit-reset')).toBeTruthy();
      expect(res.headers.get('retry-after'), 'retry-after belongs on 429 only').toBeNull();
    });

    it('cannot be evaded by rotating X-Forwarded-For on the login endpoint', async () => {
      // The brute-force guard: without this, a password can be attacked freely
      // by changing one header between attempts.
      let blocked = 0;
      for (let attempt = 0; attempt < 14; attempt++) {
        const res = await call('/auth/login', {
          method: 'POST',
          body: { email: 'nobody@example.com', password: 'wrong' },
          headers: { 'x-forwarded-for': `198.51.100.${attempt + 10}` },
        });
        if (res.status === 429) blocked++;
      }
      if (blocked === 0) {
        throw new Error(
          'Rotating X-Forwarded-For evaded the login rate limit. That is expected only when this ' +
            'runner is a trusted proxy (TRUST_PROXY >= 1); otherwise it is a brute-force hole. ' +
            'Run against an instance with TRUST_PROXY unset.',
        );
      }
      expect(blocked).toBeGreaterThan(0);
    });

    it('answers 429 with the documented code and a retry hint', async () => {
      let limited: Awaited<ReturnType<typeof call>> | null = null;
      for (let attempt = 0; attempt < 15 && !limited; attempt++) {
        const res = await call('/auth/login', {
          method: 'POST',
          body: { email: 'nobody@example.com', password: 'wrong' },
        });
        if (res.status === 429) limited = res;
      }
      expect(limited, 'the credential endpoint must be rate limited').not.toBeNull();
      expect((limited!.json as { error: { code: string } }).error.code).toBe('rate_limited');
      expect(limited!.headers.get('retry-after')).toBeTruthy();
    });
  });
});

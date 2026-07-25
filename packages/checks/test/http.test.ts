import { afterEach, describe, expect, it, vi } from 'vitest';
import { HttpCheckExecutor } from '../src/index.js';

const executor = new HttpCheckExecutor();
const ctx = (config: Record<string, unknown> = {}) => ({
  target: 'https://example.test',
  config,
  timeoutMs: 2000,
});

function mockFetch(status: number, body = ''): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(body, { status }))),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('HttpCheckExecutor', () => {
  it('is up on an accepted status', async () => {
    mockFetch(200);
    const out = await executor.execute(ctx());
    expect(out.up).toBe(true);
    expect(out.statusCode).toBe(200);
    expect(out.responseMs).not.toBeNull();
  });

  it('is down on an unexpected status', async () => {
    mockFetch(500);
    const out = await executor.execute(ctx());
    expect(out.up).toBe(false);
    expect(out.error?.kind).toBe('http_status');
  });

  it('honours a keyword assertion', async () => {
    mockFetch(200, 'service is ok');
    expect((await executor.execute(ctx({ keyword: 'ok' }))).up).toBe(true);
    mockFetch(200, 'nope');
    const out = await executor.execute(ctx({ keyword: 'ok' }));
    expect(out.up).toBe(false);
    expect(out.error?.kind).toBe('protocol');
  });

  it('evaluates JSON-path assertions', async () => {
    mockFetch(200, '{"status":"ok","count":7}');
    const passing = await executor.execute(
      ctx({
        assertions: {
          logic: 'and',
          rules: [
            { source: 'status', op: 'eq', value: 200 },
            { source: 'json', path: 'status', op: 'eq', value: 'ok' },
            { source: 'json', path: 'count', op: 'gte', value: 5 },
          ],
        },
      }),
    );
    expect(passing.up).toBe(true);

    mockFetch(200, '{"status":"degraded"}');
    const failing = await executor.execute(
      ctx({
        assertions: { logic: 'and', rules: [{ source: 'json', path: 'status', op: 'eq', value: 'ok' }] },
      }),
    );
    expect(failing.up).toBe(false);
    expect(failing.error?.kind).toBe('protocol');
  });

  it('classifies network errors as down', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.reject(Object.assign(new Error('fail'), { cause: { code: 'ENOTFOUND' } })),
      ),
    );
    const out = await executor.execute(ctx());
    expect(out.up).toBe(false);
    expect(out.error?.kind).toBe('dns');
  });
});

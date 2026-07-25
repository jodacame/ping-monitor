import { describe, expect, it } from 'vitest';
import { MASK, redactConfig, restoreRedacted } from '../src/factory.js';

describe('redactConfig', () => {
  it('masks passwords and tokens', () => {
    const out = redactConfig({ host: 'smtp.example.com', user: 'u', pass: 'hunter2' });
    expect(out.pass).toBe(MASK);
    expect(out.host).toBe('smtp.example.com');
    expect(out.user).toBe('u');
  });

  it('masks the secret tail of a webhook URL but keeps it recognisable', () => {
    // For Slack/Discord the URL is the credential, so a read-only key must not
    // be able to read it back in full.
    const out = redactConfig({ url: 'https://hooks.slack.com/services/T001/B002/xoxbSECRET' });
    expect(out.url).toBe(`https://hooks.slack.com/services/${MASK}`);
    expect(String(out.url)).not.toContain('xoxbSECRET');
  });

  it('masks a query string that carries a token', () => {
    const out = redactConfig({ url: 'https://example.com/?token=abc123' });
    expect(String(out.url)).not.toContain('abc123');
  });

  it('keeps a short, secret-free URL usable', () => {
    expect(redactConfig({ url: 'https://example.com/hook' }).url).toBe('https://example.com/hook');
  });

  it('masks an unparseable URL entirely rather than risk leaking it', () => {
    expect(redactConfig({ url: 'not a url' }).url).toBe(MASK);
  });

  it('masks secret-looking headers but leaves ordinary ones', () => {
    const out = redactConfig({
      headers: { Authorization: 'Bearer abc', 'X-Trace': 'keep-me' },
    }) as { headers: Record<string, string> };
    expect(out.headers.Authorization).toBe(MASK);
    expect(out.headers['X-Trace']).toBe('keep-me');
  });

  it('does not mutate the original config', () => {
    const original = { pass: 'hunter2' };
    redactConfig(original);
    expect(original.pass).toBe('hunter2');
  });
});

describe('restoreRedacted', () => {
  it('keeps the stored secret when the client sends back the mask', () => {
    const merged = restoreRedacted({ host: 'new.example.com', pass: MASK }, { host: 'old', pass: 'hunter2' });
    expect(merged.pass).toBe('hunter2');
    expect(merged.host).toBe('new.example.com');
  });

  it('keeps the stored URL when the client sends back a masked one', () => {
    const stored = { url: 'https://hooks.slack.com/services/T001/B002/xoxbSECRET' };
    const merged = restoreRedacted({ url: `https://hooks.slack.com/services/${MASK}` }, stored);
    expect(merged.url).toBe(stored.url);
  });

  it('accepts a genuine new secret', () => {
    expect(restoreRedacted({ pass: 'brand-new' }, { pass: 'old' }).pass).toBe('brand-new');
  });

  it('restores nested masked values', () => {
    const merged = restoreRedacted(
      { auth: { token: MASK } },
      { auth: { token: 'real-token' } },
    ) as { auth: { token: string } };
    expect(merged.auth.token).toBe('real-token');
  });

  it('a full read-then-write round-trip preserves every secret', () => {
    const stored = {
      url: 'https://hooks.slack.com/services/T001/B002/xoxbSECRET',
      auth: { token: 'tok' },
      headers: { Authorization: 'Bearer abc' },
    };
    expect(restoreRedacted(redactConfig(stored), stored)).toEqual(stored);
  });
});

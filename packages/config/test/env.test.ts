import { describe, expect, it } from 'vitest';
import { loadApiConfig } from '../src/env.js';

const base = { JWT_SECRET: 'x'.repeat(16) };

describe('loadApiConfig — ALLOW_REGISTRATION', () => {
  it('defaults to false when unset', () => {
    expect(loadApiConfig(base).allowRegistration).toBe(false);
  });

  it('is true only for "true" or "1"', () => {
    expect(loadApiConfig({ ...base, ALLOW_REGISTRATION: 'true' }).allowRegistration).toBe(true);
    expect(loadApiConfig({ ...base, ALLOW_REGISTRATION: '1' }).allowRegistration).toBe(true);
  });

  it('treats "false"/"0"/garbage as false (no string-truthiness pitfall)', () => {
    expect(loadApiConfig({ ...base, ALLOW_REGISTRATION: 'false' }).allowRegistration).toBe(false);
    expect(loadApiConfig({ ...base, ALLOW_REGISTRATION: '0' }).allowRegistration).toBe(false);
    expect(loadApiConfig({ ...base, ALLOW_REGISTRATION: 'yes' }).allowRegistration).toBe(false);
  });
});

describe('loadApiConfig — TRUST_PROXY', () => {
  // The client IP gates rate limiting and API-key IP allowlists, so the default
  // must not trust a header the caller controls.
  it('trusts nothing by default', () => {
    expect(loadApiConfig(base).trustProxy).toBe(false);
  });

  it('reads a hop count as a number', () => {
    expect(loadApiConfig({ ...base, TRUST_PROXY: '1' }).trustProxy).toBe(1);
    expect(loadApiConfig({ ...base, TRUST_PROXY: '2' }).trustProxy).toBe(2);
  });

  it('accepts an explicit list of trusted proxies', () => {
    expect(loadApiConfig({ ...base, TRUST_PROXY: '10.0.0.1, 172.16.0.0/12' }).trustProxy).toEqual([
      '10.0.0.1',
      '172.16.0.0/12',
    ]);
  });

  it('treats "false", "0" and empty as trust-nothing', () => {
    expect(loadApiConfig({ ...base, TRUST_PROXY: 'false' }).trustProxy).toBe(false);
    expect(loadApiConfig({ ...base, TRUST_PROXY: '0' }).trustProxy).toBe(false);
    expect(loadApiConfig({ ...base, TRUST_PROXY: '   ' }).trustProxy).toBe(false);
  });

  it('allows an explicit opt-in to trusting every hop', () => {
    expect(loadApiConfig({ ...base, TRUST_PROXY: 'true' }).trustProxy).toBe(true);
  });

  it('never turns a negative or fractional value into a hop count', () => {
    // These would be nonsense as hop counts; falling through to the list branch
    // keeps them harmless (they simply match no proxy).
    expect(loadApiConfig({ ...base, TRUST_PROXY: '-1' }).trustProxy).toEqual(['-1']);
    expect(loadApiConfig({ ...base, TRUST_PROXY: '1.5' }).trustProxy).toEqual(['1.5']);
  });
});

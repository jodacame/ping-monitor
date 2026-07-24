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

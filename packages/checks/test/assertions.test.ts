import { describe, expect, it } from 'vitest';
import {
  type AssertionContext,
  type AssertionGroup,
  evaluateAssertions,
} from '../src/index.js';

const ctx = (over: Partial<AssertionContext> = {}): AssertionContext => ({
  status: 200,
  responseMs: 120,
  bodyText: '{"status":"ok","count":5}',
  headers: new Headers({ 'content-type': 'application/json' }),
  json: { status: 'ok', count: 5 },
  ...over,
});

describe('evaluateAssertions', () => {
  it('validates a JSON value with AND logic', () => {
    const group: AssertionGroup = {
      logic: 'and',
      rules: [
        { source: 'status', op: 'eq', value: 200 },
        { source: 'json', path: 'status', op: 'eq', value: 'ok' },
        { source: 'json', path: 'count', op: 'gte', value: 3 },
      ],
    };
    expect(evaluateAssertions(group, ctx()).ok).toBe(true);
  });

  it('fails AND when one rule fails, reporting the reason', () => {
    const group: AssertionGroup = {
      logic: 'and',
      rules: [{ source: 'json', path: 'status', op: 'eq', value: 'degraded' }],
    };
    const result = evaluateAssertions(group, ctx());
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('json(status)');
  });

  it('passes OR when any rule matches', () => {
    const group: AssertionGroup = {
      logic: 'or',
      rules: [
        { source: 'json', path: 'status', op: 'eq', value: 'degraded' },
        { source: 'response_time', op: 'lt', value: 500 },
      ],
    };
    expect(evaluateAssertions(group, ctx()).ok).toBe(true);
  });

  it('supports nested groups and body/regex/contains', () => {
    const group: AssertionGroup = {
      logic: 'and',
      rules: [
        { source: 'body', op: 'contains', value: '"status"' },
        {
          logic: 'or',
          rules: [
            { source: 'status', op: 'eq', value: 500 },
            { source: 'body', op: 'regex', value: '"count":\\d+' },
          ],
        },
      ],
    };
    expect(evaluateAssertions(group, ctx()).ok).toBe(true);
  });
});

import { z } from 'zod';

/**
 * Health assertions for HTTP checks.
 *
 * A monitor's health can be defined by validating the response beyond the status
 * code: a plain-text body, a header, the response time, or a value extracted via
 * JSON path — compared with a rich set of operators and combined with nested
 * AND/OR groups, so any condition is expressible.
 */

export const ASSERTION_SOURCES = ['status', 'response_time', 'body', 'header', 'json'] as const;
export const ASSERTION_OPERATORS = [
  'eq',
  'ne',
  'gt',
  'gte',
  'lt',
  'lte',
  'contains',
  'not_contains',
  'regex',
  'exists',
  'not_exists',
] as const;

export const assertionSchema = z.object({
  source: z.enum(ASSERTION_SOURCES),
  /** JSON path (for `json`) or header name (for `header`). */
  path: z.string().optional(),
  op: z.enum(ASSERTION_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});
export type Assertion = z.infer<typeof assertionSchema>;

export interface AssertionGroup {
  logic: 'and' | 'or';
  rules: Array<Assertion | AssertionGroup>;
}

export const assertionGroupSchema: z.ZodType<AssertionGroup> = z.lazy(() =>
  z.object({
    logic: z.enum(['and', 'or']),
    rules: z.array(z.union([assertionSchema, assertionGroupSchema])).min(1).max(50),
  }),
);

export interface AssertionContext {
  readonly status: number;
  readonly responseMs: number | null;
  readonly bodyText: string | undefined;
  readonly headers: Headers;
  /** Parsed JSON body, or undefined if not parsed / not JSON. */
  readonly json: unknown;
}

export interface AssertionResult {
  readonly ok: boolean;
  readonly reason?: string;
}

function isGroup(rule: Assertion | AssertionGroup): rule is AssertionGroup {
  return 'logic' in rule;
}

/** True if evaluating the tree requires reading the response body. */
export function assertionsNeedBody(group: AssertionGroup): boolean {
  return group.rules.some((rule) =>
    isGroup(rule) ? assertionsNeedBody(rule) : rule.source === 'body' || rule.source === 'json',
  );
}

/** True if the tree references a JSON value (body must be parsed as JSON). */
export function assertionsNeedJson(group: AssertionGroup): boolean {
  return group.rules.some((rule) =>
    isGroup(rule) ? assertionsNeedJson(rule) : rule.source === 'json',
  );
}

/** Resolve a dot/index path (e.g. `data.items.0.status`) within a JSON value. */
function resolveJsonPath(root: unknown, path: string | undefined): unknown {
  if (!path) return root;
  let current: unknown = root;
  for (const segment of path.split('.')) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function actualValue(assertion: Assertion, ctx: AssertionContext): unknown {
  switch (assertion.source) {
    case 'status':
      return ctx.status;
    case 'response_time':
      return ctx.responseMs;
    case 'body':
      return ctx.bodyText;
    case 'header':
      return assertion.path ? (ctx.headers.get(assertion.path) ?? undefined) : undefined;
    case 'json':
      return resolveJsonPath(ctx.json, assertion.path);
  }
}

function toNumber(v: unknown): number {
  return typeof v === 'number' ? v : Number(v);
}

function looseEquals(a: unknown, b: unknown): boolean {
  const an = toNumber(a);
  const bn = toNumber(b);
  if (!Number.isNaN(an) && !Number.isNaN(bn)) return an === bn;
  return String(a) === String(b);
}

function applyOperator(op: Assertion['op'], actual: unknown, expected: unknown): boolean {
  switch (op) {
    case 'exists':
      return actual !== undefined && actual !== null;
    case 'not_exists':
      return actual === undefined || actual === null;
    case 'eq':
      return looseEquals(actual, expected);
    case 'ne':
      return !looseEquals(actual, expected);
    case 'gt':
      return toNumber(actual) > toNumber(expected);
    case 'gte':
      return toNumber(actual) >= toNumber(expected);
    case 'lt':
      return toNumber(actual) < toNumber(expected);
    case 'lte':
      return toNumber(actual) <= toNumber(expected);
    case 'contains':
      return String(actual).includes(String(expected));
    case 'not_contains':
      return !String(actual).includes(String(expected));
    case 'regex':
      try {
        return new RegExp(String(expected)).test(String(actual));
      } catch {
        return false;
      }
  }
}

function describe(assertion: Assertion, actual: unknown): string {
  const target =
    assertion.source + (assertion.path ? `(${assertion.path})` : '');
  const expected = assertion.value === undefined ? '' : ` ${JSON.stringify(assertion.value)}`;
  return `${target} ${assertion.op}${expected} — got ${JSON.stringify(actual)}`;
}

function evaluateAssertion(assertion: Assertion, ctx: AssertionContext): AssertionResult {
  const actual = actualValue(assertion, ctx);
  const ok = applyOperator(assertion.op, actual, assertion.value);
  return ok ? { ok: true } : { ok: false, reason: describe(assertion, actual) };
}

/** Evaluate an assertion tree against a response context. */
export function evaluateAssertions(group: AssertionGroup, ctx: AssertionContext): AssertionResult {
  const results = group.rules.map((rule) =>
    isGroup(rule) ? evaluateAssertions(rule, ctx) : evaluateAssertion(rule, ctx),
  );

  if (group.logic === 'and') {
    const failed = results.find((r) => !r.ok);
    return failed ?? { ok: true };
  }

  // OR: at least one must pass.
  if (results.some((r) => r.ok)) return { ok: true };
  const reasons = results.map((r) => r.reason).filter(Boolean).join(' OR ');
  return { ok: false, reason: reasons || 'no OR rule matched' };
}

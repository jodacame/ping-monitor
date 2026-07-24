import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import {
  CheckErrorKind,
  type CheckOutcome,
  MonitorType,
  outcomeDown,
  outcomeUp,
} from '@ping/core';
import type { CheckContext, CheckExecutor } from './executor.js';
import { classifyNetworkError } from './network-errors.js';
import {
  assertionGroupSchema,
  assertionsNeedBody,
  assertionsNeedJson,
  evaluateAssertions,
} from './assertions.js';

/**
 * Type-specific configuration for HTTP monitors, validated at the edges so the
 * executor can trust its input. The same schema is reused by the API to
 * validate monitor creation payloads (one source of truth).
 */
const statusRange = z
  .tuple([z.number().int().min(100).max(599), z.number().int().min(100).max(599)])
  .refine(([lo, hi]) => lo <= hi, { message: 'range start must be <= end' });

export const httpConfigSchema = z
  .object({
    method: z.enum(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    /** A response status inside any of these inclusive ranges counts as UP. */
    acceptedStatusRanges: z.array(statusRange).nonempty().default([[200, 399]]),
    /** When set, the response body must contain this substring. */
    keyword: z.string().min(1).optional(),
    followRedirects: z.boolean().default(true),
    /** Optional health assertions (AND/OR tree) evaluated against the response. */
    assertions: assertionGroupSchema.optional(),
  })
  .strip();

export type HttpConfig = z.infer<typeof httpConfigSchema>;

/** Parse and normalise raw monitor config into a validated HttpConfig. */
export function parseHttpConfig(raw: unknown): HttpConfig {
  return httpConfigSchema.parse(raw ?? {});
}

function statusAccepted(status: number, ranges: HttpConfig['acceptedStatusRanges']): boolean {
  return ranges.some(([lo, hi]) => status >= lo && status <= hi);
}

/** Executes HTTP/HTTPS probes using the platform `fetch` with a hard timeout. */
export class HttpCheckExecutor implements CheckExecutor {
  readonly type = MonitorType.Http;

  async execute(context: CheckContext): Promise<CheckOutcome> {
    let config: HttpConfig;
    try {
      config = parseHttpConfig(context.config);
    } catch (err) {
      return outcomeDown({
        kind: CheckErrorKind.Protocol,
        message: err instanceof Error ? `Invalid monitor config: ${err.message}` : 'Invalid config',
      });
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), context.timeoutMs);
    const start = performance.now();

    try {
      // Build init incrementally: exactOptionalPropertyTypes forbids passing
      // `undefined` for headers/body, so we only set them when present.
      const init: RequestInit = {
        method: config.method,
        redirect: config.followRedirects ? 'follow' : 'manual',
        signal: controller.signal,
      };
      if (config.headers) init.headers = config.headers;
      if (config.body !== undefined) init.body = config.body;

      const response = await fetch(context.target, init);

      // Read the body only when a keyword or body/json assertion needs it.
      const needsBody =
        Boolean(config.keyword) || (config.assertions ? assertionsNeedBody(config.assertions) : false);
      const bodyText = needsBody ? await response.text() : undefined;
      const elapsed = Math.round(performance.now() - start);

      if (!statusAccepted(response.status, config.acceptedStatusRanges)) {
        return outcomeDown(
          { kind: CheckErrorKind.HttpStatus, message: `Unexpected HTTP status ${response.status}` },
          elapsed,
          response.status,
        );
      }

      if (config.keyword && !(bodyText ?? '').includes(config.keyword)) {
        return outcomeDown(
          { kind: CheckErrorKind.Protocol, message: `Keyword "${config.keyword}" not found` },
          elapsed,
          response.status,
        );
      }

      if (config.assertions) {
        // Parse JSON lazily, only when a json assertion is present.
        let json: unknown;
        if (assertionsNeedJson(config.assertions)) {
          try {
            json = JSON.parse(bodyText ?? '');
          } catch {
            return outcomeDown(
              { kind: CheckErrorKind.Protocol, message: 'Response body is not valid JSON' },
              elapsed,
              response.status,
            );
          }
        }
        const result = evaluateAssertions(config.assertions, {
          status: response.status,
          responseMs: elapsed,
          bodyText,
          headers: response.headers,
          json,
        });
        if (!result.ok) {
          return outcomeDown(
            { kind: CheckErrorKind.Protocol, message: `Assertion failed: ${result.reason ?? ''}` },
            elapsed,
            response.status,
          );
        }
      }

      return outcomeUp(elapsed, response.status);
    } catch (err) {
      return outcomeDown(classifyNetworkError(err));
    } finally {
      clearTimeout(timer);
    }
  }
}

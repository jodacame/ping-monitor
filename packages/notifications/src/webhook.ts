import { z } from 'zod';
import {
  ConnectorType,
  type Notification,
  type NotificationConnector,
  notificationContext,
} from './types.js';

/**
 * Generic REST/webhook connector — works with any HTTP notification API.
 *
 * Supports POST/PUT, custom headers, bearer/basic auth, and a `{{variable}}`
 * body template so the exact payload the target API expects can be shaped by the
 * user. When no template is given, a well-formed JSON payload with every field
 * is sent.
 */

const authSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }),
  z.object({ type: z.literal('bearer'), token: z.string().min(1) }),
  z.object({ type: z.literal('basic'), username: z.string().min(1), password: z.string().min(1) }),
]);

/**
 * Validate that a body template is well-formed JSON. Placeholders are replaced
 * with a neutral literal first, so `{{var}}` used either as a bare value or
 * inside a string still yields parseable JSON — only real structural mistakes
 * (missing quotes, braces, commas) fail.
 */
export function isValidJsonTemplate(template: string): boolean {
  try {
    JSON.parse(template.replace(/\{\{[^}]*\}\}/g, '0'));
    return true;
  } catch {
    return false;
  }
}

export const webhookConfigSchema = z
  .object({
    url: z.string().url(),
    method: z.enum(['POST', 'PUT']).default('POST'),
    contentType: z.string().default('application/json'),
    headers: z.record(z.string()).default({}),
    auth: authSchema.default({ type: 'none' }),
    /** Optional body template using `{{name}}` placeholders. */
    bodyTemplate: z.string().optional(),
  })
  .strip()
  .superRefine((cfg, ctx) => {
    // When sending JSON, the template must be valid JSON once rendered.
    if (
      cfg.bodyTemplate &&
      cfg.contentType.toLowerCase().includes('json') &&
      !isValidJsonTemplate(cfg.bodyTemplate)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['bodyTemplate'],
        message: 'Body template must be valid JSON',
      });
    }
  });

export type WebhookConfig = z.infer<typeof webhookConfigSchema>;

const TIMEOUT_MS = 10_000;
const TEMPLATE_RE = /\{\{\s*(\w+)\s*\}\}/g;

/** Substitute `{{name}}` placeholders from the context (missing → empty). */
export function renderTemplate(template: string, context: Record<string, string>): string {
  return template.replace(TEMPLATE_RE, (_match, key: string) => context[key] ?? '');
}

function defaultPayload(n: Notification): string {
  return JSON.stringify({
    severity: n.severity,
    title: n.title,
    message: n.message,
    monitorId: n.monitorId,
    monitorName: n.monitorName,
    workspaceId: n.workspaceId,
    status: n.status,
    previousStatus: n.previousStatus,
    responseMs: n.responseMs,
    errorMessage: n.errorMessage,
    at: n.at,
  });
}

export class WebhookConnector implements NotificationConnector {
  readonly type = ConnectorType.Webhook;

  constructor(private readonly config: WebhookConfig) {}

  async send(notification: Notification): Promise<void> {
    const headers: Record<string, string> = {
      'content-type': this.config.contentType,
      ...this.config.headers,
    };
    const auth = this.config.auth;
    if (auth.type === 'bearer') {
      headers['authorization'] = `Bearer ${auth.token}`;
    } else if (auth.type === 'basic') {
      const encoded = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');
      headers['authorization'] = `Basic ${encoded}`;
    }

    const body = this.config.bodyTemplate
      ? renderTemplate(this.config.bodyTemplate, notificationContext(notification))
      : defaultPayload(notification);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(this.config.url, {
        method: this.config.method,
        headers,
        body,
        signal: controller.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Webhook responded ${res.status}: ${text.slice(0, 200)}`);
      }
    } finally {
      clearTimeout(timer);
    }
  }
}

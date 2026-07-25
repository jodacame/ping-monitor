import { ConnectorType, type NotificationConnector } from './types.js';
import { SmtpConnector, smtpConfigSchema } from './smtp.js';
import { TelegramConnector, telegramConfigSchema } from './telegram.js';
import { WebhookConnector, webhookConfigSchema } from './webhook.js';

/**
 * Build/validate connectors from stored channel config. Centralising this keeps
 * the API (which validates on write) and the notifier (which instantiates on
 * dispatch) in perfect agreement about each channel type's shape.
 */

/** Validate and normalise raw config for a channel type; throws on invalid. */
export function validateChannelConfig(
  type: ConnectorType,
  config: unknown,
): Record<string, unknown> {
  switch (type) {
    case ConnectorType.Smtp:
      return smtpConfigSchema.parse(config);
    case ConnectorType.Telegram:
      return telegramConfigSchema.parse(config);
    case ConnectorType.Webhook:
      return webhookConfigSchema.parse(config);
    default:
      throw new Error(`Unknown connector type: ${String(type)}`);
  }
}

/** Instantiate a live connector for a channel type + config. */
export function createConnector(type: ConnectorType, config: unknown): NotificationConnector {
  switch (type) {
    case ConnectorType.Smtp:
      return new SmtpConnector(smtpConfigSchema.parse(config));
    case ConnectorType.Telegram:
      return new TelegramConnector(telegramConfigSchema.parse(config));
    case ConnectorType.Webhook:
      return new WebhookConnector(webhookConfigSchema.parse(config));
    default:
      throw new Error(`Unknown connector type: ${String(type)}`);
  }
}

const SECRET_KEYS = new Set(['pass', 'password', 'token', 'botToken', 'secret']);
const SECRET_HEADER_RE = /authorization|token|api[-_]?key|secret|cookie/i;
/** Placeholder shown in place of a secret. Also the "keep the stored value"
 *  sentinel accepted on update — see {@link restoreRedacted}. */
export const MASK = '••••••';

/**
 * Mask the sensitive tail of a webhook URL while keeping it recognisable.
 *
 * For most webhook providers the URL *is* the credential (Slack
 * `hooks.slack.com/services/T…/B…/<secret>`, Discord `…/webhooks/<id>/<token>`),
 * so returning it verbatim hands the secret to anyone holding a read-only key.
 * Origin and the first path segment stay visible so the operator can still tell
 * the channels apart.
 */
function maskUrl(raw: string): string {
  try {
    const url = new URL(raw);
    const segments = url.pathname.split('/').filter(Boolean);
    const visible = segments.slice(0, 1);
    const parts = segments.length > 1 || url.search ? [...visible, MASK] : visible;
    return `${url.origin}${parts.length > 0 ? `/${parts.join('/')}` : ''}`;
  } catch {
    // Not a parseable URL: mask it entirely rather than risk leaking it.
    return MASK;
  }
}

function isSecretKey(key: string, parentKey?: string): boolean {
  return SECRET_KEYS.has(key) || (parentKey === 'headers' && SECRET_HEADER_RE.test(key));
}

function redactDeep(node: unknown, parentKey?: string): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      redactDeep(value, key);
    } else if (typeof value === 'string' && key === 'url') {
      obj[key] = maskUrl(value);
    } else if (value && isSecretKey(key, parentKey)) {
      obj[key] = MASK;
    }
  }
}

/** Deep-mask secret-bearing fields before returning a channel's config to a client. */
export function redactConfig(config: Record<string, unknown>): Record<string, unknown> {
  const clone = structuredClone(config);
  redactDeep(clone);
  return clone;
}

function restoreDeep(incoming: Record<string, unknown>, stored: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(incoming)) {
    const previous = stored[key];
    if (value && typeof value === 'object' && previous && typeof previous === 'object') {
      restoreDeep(value as Record<string, unknown>, previous as Record<string, unknown>);
    } else if (typeof value === 'string' && previous !== undefined) {
      // A client that re-submits a config it fetched sends back the mask, not
      // the secret. Treat that as "leave unchanged" so a round-trip through the
      // API cannot silently destroy a working credential.
      if (value === MASK || (key === 'url' && value.includes(MASK))) incoming[key] = previous;
    }
  }
}

/**
 * Merge a client-supplied config over the stored one, restoring any value that
 * came back masked. Call before validating an update.
 */
export function restoreRedacted(
  incoming: Record<string, unknown>,
  stored: Record<string, unknown>,
): Record<string, unknown> {
  const clone = structuredClone(incoming);
  restoreDeep(clone, stored);
  return clone;
}

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
const MASK = '••••••';

function redactDeep(node: unknown, parentKey?: string): void {
  if (!node || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === 'object') {
      redactDeep(value, key);
    } else if (value && (SECRET_KEYS.has(key) || (parentKey === 'headers' && SECRET_HEADER_RE.test(key)))) {
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

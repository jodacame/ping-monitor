import type { MonitorStatus } from '@ping/core';

/**
 * Notification vocabulary and the connector Strategy interface.
 *
 * A `NotificationConnector` turns a rendered `Notification` into an actual
 * message on some channel (email, Telegram, a generic REST endpoint, …). New
 * channels are added by implementing this interface — nothing else changes
 * (Open/Closed).
 */

export const ConnectorType = {
  Smtp: 'smtp',
  Telegram: 'telegram',
  Webhook: 'webhook',
} as const;
export type ConnectorType = (typeof ConnectorType)[keyof typeof ConnectorType];

export const CONNECTOR_TYPES: readonly ConnectorType[] = Object.values(ConnectorType);

export const NotificationSeverity = {
  Critical: 'critical',
  Recovery: 'recovery',
  Info: 'info',
} as const;
export type NotificationSeverity = (typeof NotificationSeverity)[keyof typeof NotificationSeverity];

/**
 * A channel-agnostic, ready-to-send message plus the full event context, so
 * templated connectors (webhook) can expose every field to users.
 */
export interface Notification {
  readonly severity: NotificationSeverity;
  readonly title: string;
  readonly message: string;
  readonly monitorName: string;
  readonly monitorId: string;
  readonly workspaceId: string;
  readonly status: MonitorStatus;
  readonly previousStatus: MonitorStatus;
  readonly responseMs: number | null;
  readonly errorMessage: string | null;
  /** ISO-8601 timestamp of the event. */
  readonly at: string;
}

/** The flat variable map exposed to webhook body templates as `{{name}}`. */
export type NotificationContext = Record<string, string>;

/** Build the `{{name}}` substitution context from a notification. */
export function notificationContext(n: Notification): NotificationContext {
  return {
    title: n.title,
    message: n.message,
    monitorName: n.monitorName,
    monitorId: n.monitorId,
    workspaceId: n.workspaceId,
    status: n.status,
    previousStatus: n.previousStatus,
    severity: n.severity,
    responseMs: n.responseMs === null ? '' : String(n.responseMs),
    errorMessage: n.errorMessage ?? '',
    at: n.at,
  };
}

export interface NotificationConnector {
  readonly type: ConnectorType;
  /** Deliver the notification, or throw on failure. */
  send(notification: Notification): Promise<void>;
}

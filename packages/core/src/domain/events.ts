import type { CheckError } from './check.js';
import type { MonitorStatus } from './monitor.js';

/**
 * Domain events published on the event bus (a Redis stream in production).
 *
 * Keeping events as plain, serializable data with an explicit discriminated
 * `type` lets any number of independent consumers (notifiers, webhooks,
 * analytics) react without the producer knowing about them (Open/Closed).
 */

export const DomainEventType = {
  MonitorStatusChanged: 'monitor.status_changed',
} as const;
export type DomainEventType = (typeof DomainEventType)[keyof typeof DomainEventType];

/** Emitted whenever a monitor's public status transitions (e.g. UP -> DOWN). */
export interface MonitorStatusChangedEvent {
  readonly type: typeof DomainEventType.MonitorStatusChanged;
  readonly monitorId: string;
  readonly workspaceId: string;
  readonly monitorName: string;
  readonly from: MonitorStatus;
  readonly to: MonitorStatus;
  /** ISO-8601 timestamp of the check that caused the transition. */
  readonly at: string;
  readonly responseMs: number | null;
  readonly error?: CheckError;
}

/** Union of all domain events. Extend as new event types are introduced. */
export type DomainEvent = MonitorStatusChangedEvent;

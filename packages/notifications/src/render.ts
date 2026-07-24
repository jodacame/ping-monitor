import type { MonitorStatus, MonitorStatusChangedEvent } from '@ping/core';
import { type Notification, NotificationSeverity } from './types.js';

/**
 * Which status transitions are worth alerting on. We notify when a monitor goes
 * DOWN, and when it recovers from DOWN to UP — but not on first-check noise
 * (pending → up) or administrative transitions (→ paused).
 */
export function shouldNotify(from: MonitorStatus, to: MonitorStatus): boolean {
  if (to === 'down') return true;
  if (to === 'up' && from === 'down') return true;
  return false;
}

function formatTime(iso: string): string {
  return new Date(iso).toUTCString();
}

/** Render a status-change event into a human-friendly notification + context. */
export function eventToNotification(event: MonitorStatusChangedEvent): Notification {
  const isDown = event.to === 'down';
  const base = {
    monitorName: event.monitorName,
    monitorId: event.monitorId,
    workspaceId: event.workspaceId,
    status: event.to,
    previousStatus: event.from,
    responseMs: event.responseMs,
    errorMessage: event.error?.message ?? null,
    at: event.at,
  };

  if (isDown) {
    const reason = event.error ? `: ${event.error.message}` : '';
    return {
      ...base,
      severity: NotificationSeverity.Critical,
      title: `🔴 ${event.monitorName} is DOWN`,
      message: `${event.monitorName} went down${reason} at ${formatTime(event.at)}.`,
    };
  }

  const latency = event.responseMs !== null ? ` (${event.responseMs} ms)` : '';
  return {
    ...base,
    severity: NotificationSeverity.Recovery,
    title: `🟢 ${event.monitorName} is back UP`,
    message: `${event.monitorName} recovered at ${formatTime(event.at)}${latency}.`,
  };
}

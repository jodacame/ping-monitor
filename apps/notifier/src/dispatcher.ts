import { type DomainEvent, DomainEventType } from '@ping/core';
import type { Logger } from '@ping/config';
import { type Database, NotificationChannelRepository } from '@ping/db';
import {
  type ConnectorType,
  createConnector,
  eventToNotification,
  shouldNotify,
} from '@ping/notifications';

/**
 * Turns domain events into delivered alerts.
 *
 * For a status-change worth alerting on, it resolves every enabled channel in
 * the event's workspace, renders the notification once, and dispatches to all
 * channels concurrently — recording each delivery (success or failure) without
 * letting one bad channel affect the others.
 */
export class NotificationDispatcher {
  constructor(
    private readonly db: Database,
    private readonly logger: Logger,
  ) {}

  async handle(event: DomainEvent): Promise<void> {
    if (event.type !== DomainEventType.MonitorStatusChanged) return;
    if (!shouldNotify(event.from, event.to)) return;

    const repo = new NotificationChannelRepository(this.db);
    // Alerts are per-monitor: only channels linked to this monitor are notified.
    const channels = await repo.listEnabledForMonitorPublicId(event.monitorId);
    if (channels.length === 0) return;

    const notification = eventToNotification(event);

    await Promise.all(
      channels.map(async (channel) => {
        try {
          const connector = createConnector(channel.type as ConnectorType, channel.config);
          await connector.send(notification);
          await repo.recordDelivery(channel.id, event.monitorId, true, null);
          this.logger.info(
            { channel: channel.name, type: channel.type, monitor: event.monitorName, to: event.to },
            'alert delivered',
          );
        } catch (err) {
          const detail = err instanceof Error ? err.message : String(err);
          await repo.recordDelivery(channel.id, event.monitorId, false, detail).catch(() => undefined);
          this.logger.warn(
            { channel: channel.name, type: channel.type, err: detail },
            'alert delivery failed',
          );
        }
      }),
    );
  }
}

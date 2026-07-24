import { NotFoundError, newId } from '@ping/core';
import {
  type Database,
  type NotificationChannelRecord,
  NotificationChannelRepository,
} from '@ping/db';
import {
  type ConnectorType,
  type Notification,
  NotificationSeverity,
  createConnector,
  redactConfig,
  validateChannelConfig,
} from '@ping/notifications';

export interface CreateChannelInput {
  readonly type: ConnectorType;
  readonly name: string;
  readonly config: Record<string, unknown>;
  readonly enabled?: boolean;
}

export interface UpdateChannelInput {
  readonly name?: string;
  readonly config?: Record<string, unknown>;
  readonly enabled?: boolean;
}

/** Public (secret-masked) channel shape returned by the API. */
export function channelToDto(channel: NotificationChannelRecord): Record<string, unknown> {
  return {
    id: channel.publicId,
    type: channel.type,
    name: channel.name,
    config: redactConfig(channel.config),
    enabled: channel.enabled,
    createdAt: channel.createdAt,
    updatedAt: channel.updatedAt,
  };
}

/** Notification-channel use cases: CRUD plus a live "send test" action. */
export class ChannelService {
  constructor(private readonly db: Database) {}

  async create(workspaceId: string, input: CreateChannelInput): Promise<NotificationChannelRecord> {
    const config = validateChannelConfig(input.type, input.config);
    return new NotificationChannelRepository(this.db).create({
      publicId: newId(),
      workspaceId,
      type: input.type,
      name: input.name.trim(),
      config,
      enabled: input.enabled ?? true,
    });
  }

  list(workspaceId: string): Promise<NotificationChannelRecord[]> {
    return new NotificationChannelRepository(this.db).list(workspaceId);
  }

  async get(workspaceId: string, publicId: string): Promise<NotificationChannelRecord> {
    const channel = await new NotificationChannelRepository(this.db).findByPublicId(
      publicId,
      workspaceId,
    );
    if (!channel) throw new NotFoundError('Notification channel not found');
    return channel;
  }

  async update(
    workspaceId: string,
    publicId: string,
    input: UpdateChannelInput,
  ): Promise<NotificationChannelRecord> {
    const existing = await this.get(workspaceId, publicId);
    // Re-validate config against the (immutable) channel type when changed.
    const config =
      input.config !== undefined
        ? validateChannelConfig(existing.type as ConnectorType, input.config)
        : undefined;

    const updated = await new NotificationChannelRepository(this.db).update(publicId, workspaceId, {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(config !== undefined ? { config } : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
    });
    if (!updated) throw new NotFoundError('Notification channel not found');
    return updated;
  }

  async delete(workspaceId: string, publicId: string): Promise<void> {
    const deleted = await new NotificationChannelRepository(this.db).delete(publicId, workspaceId);
    if (!deleted) throw new NotFoundError('Notification channel not found');
  }

  /** Send a test notification through the channel; never throws on send failure. */
  async test(workspaceId: string, publicId: string): Promise<{ ok: boolean; error?: string }> {
    const channel = await this.get(workspaceId, publicId);
    const notification: Notification = {
      severity: NotificationSeverity.Info,
      title: '✅ Ping Monitor test alert',
      message: `This is a test notification from channel "${channel.name}". If you can read this, alerts are working.`,
      monitorName: 'Test monitor',
      monitorId: 'test',
      workspaceId,
      status: 'up',
      previousStatus: 'down',
      responseMs: null,
      errorMessage: null,
      at: new Date().toISOString(),
    };

    try {
      const connector = createConnector(channel.type as ConnectorType, channel.config);
      await connector.send(notification);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Delivery failed' };
    }
  }
}

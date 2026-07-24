import type { Redis } from 'ioredis';
import type { Logger } from '@ping/config';
import type { DomainEvent } from '@ping/core';

/**
 * Domain event bus over a single Redis stream. Producers (`publish`) never know
 * their consumers; any number of independent consumer groups (notifier, webhook
 * dispatcher, analytics) can subscribe, giving an Open/Closed reaction model.
 */

const DEFAULT_STREAM = 'events:monitor';
const DEFAULT_MAX_LEN = 200_000;

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
}

export class RedisEventBus implements EventBus {
  constructor(
    private readonly redis: Redis,
    private readonly stream: string = DEFAULT_STREAM,
    private readonly maxLen: number = DEFAULT_MAX_LEN,
  ) {}

  streamKey(): string {
    return this.stream;
  }

  async publish(event: DomainEvent): Promise<void> {
    await this.redis.xadd(this.stream, 'MAXLEN', '~', this.maxLen, '*', 'd', JSON.stringify(event));
  }

  async ensureGroup(group: string): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', this.stream, group, '0', 'MKSTREAM');
    } catch (err) {
      if (!(err instanceof Error) || !err.message.includes('BUSYGROUP')) throw err;
    }
  }
}

export interface EventConsumer {
  run(): Promise<void>;
  stop(): void;
}

export interface EventConsumerOptions {
  readonly readClient: Redis;
  readonly controlClient: Redis;
  readonly stream: string;
  readonly group: string;
  readonly consumerName: string;
  readonly blockMs: number;
  readonly count: number;
  readonly onEvent: (event: DomainEvent) => Promise<void>;
  readonly logger?: Logger;
}

type StreamEntry = [id: string, fields: string[]];

export function createEventConsumer(options: EventConsumerOptions): EventConsumer {
  let running = false;

  async function process(entries: StreamEntry[]): Promise<void> {
    const acked: string[] = [];
    await Promise.all(
      entries.map(async ([id, fields]) => {
        const idx = fields.indexOf('d');
        const payload = idx >= 0 ? fields[idx + 1] : undefined;
        if (payload === undefined) {
          acked.push(id); // nothing usable; drop it
          return;
        }
        try {
          await options.onEvent(JSON.parse(payload) as DomainEvent);
          acked.push(id);
        } catch (err) {
          options.logger?.error({ err, id }, 'event handler failed');
        }
      }),
    );
    if (acked.length > 0) {
      await options.controlClient.xack(options.stream, options.group, ...acked);
    }
  }

  return {
    async run(): Promise<void> {
      running = true;
      while (running) {
        try {
          const res = (await options.readClient.xreadgroup(
            'GROUP',
            options.group,
            options.consumerName,
            'COUNT',
            options.count,
            'BLOCK',
            options.blockMs,
            'STREAMS',
            options.stream,
            '>',
          )) as Array<[string, StreamEntry[]]> | null;
          const streamData = res?.[0];
          if (streamData) await process(streamData[1]);
        } catch (err) {
          options.logger?.error({ err }, 'event consumer loop error; backing off');
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },
    stop(): void {
      running = false;
    },
  };
}

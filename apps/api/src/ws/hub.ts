import type { Redis } from 'ioredis';
import type { Logger } from '@ping/config';

/**
 * Minimal WebSocket surface we depend on (from the `ws` library that
 * @fastify/websocket bundles). Keeping it local avoids a type dependency.
 */
export interface WsSocket {
  send(data: string): void;
  close(): void;
  readyState: number;
  on(event: 'close' | 'error', listener: () => void): void;
}
const OPEN = 1;

/**
 * Fan-out hub: connections grouped by workspace. A single Redis reader feeds
 * every process, and each broadcasts only to its local connections for the
 * matching workspace — efficient and isolated (a client never sees another
 * workspace's events).
 */
export class WsHub {
  private readonly byWorkspace = new Map<string, Set<WsSocket>>();

  add(workspaceId: string, socket: WsSocket): void {
    let set = this.byWorkspace.get(workspaceId);
    if (!set) {
      set = new Set();
      this.byWorkspace.set(workspaceId, set);
    }
    set.add(socket);
  }

  remove(workspaceId: string, socket: WsSocket): void {
    const set = this.byWorkspace.get(workspaceId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) this.byWorkspace.delete(workspaceId);
  }

  broadcast(workspaceId: string, data: string): void {
    const set = this.byWorkspace.get(workspaceId);
    if (!set) return;
    for (const socket of set) {
      if (socket.readyState === OPEN) socket.send(data);
    }
  }
}

/**
 * Continuously read new monitor events (XREAD from `$`) and fan them out to the
 * hub. No consumer group is used: this is live broadcast, so every process must
 * see every event. Returns a stop function.
 */
export function startEventBroadcaster(
  redis: Redis,
  hub: WsHub,
  stream: string,
  logger: Logger,
): () => void {
  let running = true;
  let lastId = '$';

  void (async () => {
    while (running) {
      try {
        const res = (await redis.xread('BLOCK', 5000, 'STREAMS', stream, lastId)) as
          | Array<[string, Array<[string, string[]]>]>
          | null;
        if (!res) continue;
        for (const [, entries] of res) {
          for (const [id, fields] of entries) {
            lastId = id;
            const idx = fields.indexOf('d');
            const payload = idx >= 0 ? fields[idx + 1] : undefined;
            if (!payload) continue;
            try {
              const event = JSON.parse(payload) as { workspaceId?: string };
              if (event.workspaceId) hub.broadcast(event.workspaceId, payload);
            } catch {
              /* ignore malformed */
            }
          }
        }
      } catch (err) {
        logger.error({ err }, 'ws broadcaster error; backing off');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  })();

  return () => {
    running = false;
  };
}

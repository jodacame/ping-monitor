import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { z } from 'zod';
import { type CheckOutcome, CheckErrorKind, MonitorType, outcomeDown, outcomeUp } from '@ping/core';
import type { CheckContext, CheckExecutor } from './executor.js';
import { classifyNetworkError } from './network-errors.js';

/** TCP monitor config: the port to connect to (the target is the host). */
export const tcpConfigSchema = z.object({
  port: z.coerce.number().int().min(1).max(65535),
});
export type TcpConfig = z.infer<typeof tcpConfigSchema>;

export function parseTcpConfig(raw: unknown): TcpConfig {
  return tcpConfigSchema.parse(raw ?? {});
}

/** Checks that a TCP port accepts a connection, measuring connect latency. */
export class TcpCheckExecutor implements CheckExecutor {
  readonly type = MonitorType.Tcp;

  execute(context: CheckContext): Promise<CheckOutcome> {
    let config: TcpConfig;
    try {
      config = parseTcpConfig(context.config);
    } catch {
      return Promise.resolve(
        outcomeDown({ kind: CheckErrorKind.Protocol, message: 'TCP monitor requires a valid port' }),
      );
    }

    return new Promise<CheckOutcome>((resolve) => {
      const socket = new net.Socket();
      const start = performance.now();
      let settled = false;
      const finish = (outcome: CheckOutcome): void => {
        if (settled) return;
        settled = true;
        socket.destroy();
        resolve(outcome);
      };

      socket.setTimeout(context.timeoutMs);
      socket.once('connect', () => finish(outcomeUp(Math.round(performance.now() - start))));
      socket.once('timeout', () =>
        finish(outcomeDown({ kind: CheckErrorKind.Timeout, message: 'Connection timed out' })),
      );
      socket.once('error', (err) => finish(outcomeDown(classifyNetworkError(err))));
      socket.connect(config.port, context.target);
    });
  }
}

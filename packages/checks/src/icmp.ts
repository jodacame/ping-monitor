import { execFile } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { type CheckOutcome, CheckErrorKind, MonitorType, outcomeDown, outcomeUp } from '@ping/core';
import type { CheckContext, CheckExecutor } from './executor.js';

/**
 * ICMP (ping) monitor.
 *
 * Raw ICMP sockets need elevated privileges, so this shells out to the system
 * `ping` binary (portable across Linux distros; the image must include
 * iputils-ping / busybox). Latency is parsed from the output.
 */
export class IcmpCheckExecutor implements CheckExecutor {
  readonly type = MonitorType.Icmp;

  execute(context: CheckContext): Promise<CheckOutcome> {
    const timeoutSeconds = Math.max(1, Math.ceil(context.timeoutMs / 1000));
    // -c 1: one echo request. -w: overall deadline (iputils) — busybox uses -W.
    const args = ['-c', '1', '-w', String(timeoutSeconds), context.target];

    return new Promise<CheckOutcome>((resolve) => {
      const start = performance.now();
      execFile(
        'ping',
        args,
        { timeout: context.timeoutMs + 1000, windowsHide: true },
        (error, stdout) => {
          const elapsed = Math.round(performance.now() - start);
          if (error) {
            const timedOut = 'killed' in error && error.killed;
            resolve(
              outcomeDown({
                kind: timedOut ? CheckErrorKind.Timeout : CheckErrorKind.Connection,
                message: timedOut ? 'Ping timed out' : 'Host unreachable',
              }),
            );
            return;
          }
          const match = /time[=<]\s*([\d.]+)\s*ms/i.exec(stdout);
          const rtt = match ? Math.round(parseFloat(match[1]!)) : elapsed;
          resolve(outcomeUp(rtt));
        },
      );
    });
  }
}

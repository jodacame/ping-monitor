/**
 * @ping/checks — probe executors behind a single Strategy interface.
 */
import { CheckExecutorRegistry } from './executor.js';
import { HttpCheckExecutor } from './http.js';
import { TcpCheckExecutor } from './tcp.js';
import { IcmpCheckExecutor } from './icmp.js';

export * from './executor.js';
export * from './http.js';
export * from './tcp.js';
export * from './icmp.js';
export * from './assertions.js';
export * from './network-errors.js';

/** Build the default registry with all built-in executors registered. */
export function createDefaultRegistry(): CheckExecutorRegistry {
  return new CheckExecutorRegistry()
    .register(new HttpCheckExecutor())
    .register(new TcpCheckExecutor())
    .register(new IcmpCheckExecutor());
}

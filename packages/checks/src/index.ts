/**
 * @ping/checks — probe executors behind a single Strategy interface.
 */
import { CheckExecutorRegistry } from './executor.js';
import { HttpCheckExecutor } from './http.js';

export * from './executor.js';
export * from './http.js';
export * from './assertions.js';
export * from './network-errors.js';

/**
 * Build the default registry with all built-in executors registered.
 * TCP and ICMP executors are added here as they land.
 */
export function createDefaultRegistry(): CheckExecutorRegistry {
  return new CheckExecutorRegistry().register(new HttpCheckExecutor());
}

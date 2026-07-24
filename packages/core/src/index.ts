/**
 * @ping/core — the pure domain kernel.
 *
 * Contains only framework-agnostic, dependency-light building blocks:
 * domain vocabulary, the health state machine, domain events, the error
 * hierarchy and small utilities. No database, HTTP or Redis code lives here.
 */

export * from './domain/monitor.js';
export * from './domain/check.js';
export * from './domain/state-machine.js';
export * from './domain/events.js';
export * from './errors/index.js';
export * from './utils/id.js';
export * from './utils/time.js';

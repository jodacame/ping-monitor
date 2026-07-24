import { pino, type Logger, type LoggerOptions } from 'pino';

/**
 * Structured logging built on pino.
 *
 * JSON in production (machine-parseable, ready for log shippers); pretty-printed
 * in development for readability. A single root logger is created per process;
 * modules derive child loggers with `.child({ module })` to add context.
 */

export type { Logger };

export interface LoggerConfig {
  readonly level: string;
  readonly pretty: boolean;
  /** Static fields attached to every log line (e.g. service name). */
  readonly base?: Record<string, unknown>;
}

export function createLogger(config: LoggerConfig): Logger {
  const options: LoggerOptions = {
    level: config.level,
    base: config.base ?? {},
    // Redact common secret-bearing fields defensively.
    redact: {
      paths: ['req.headers.authorization', 'password', 'token', '*.password', '*.token'],
      censor: '[redacted]',
    },
  };

  if (config.pretty) {
    return pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss.l', ignore: 'pid,hostname' },
      },
    });
  }

  return pino(options);
}

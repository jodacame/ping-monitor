/**
 * The outcome of executing a single probe against a target.
 *
 * A `CheckExecutor` (see `@ping/checks`) turns a monitor definition into one of
 * these. It is deliberately protocol-agnostic so HTTP, TCP and ICMP checks all
 * share the same result shape.
 */

/** Coarse classification of a failed check, useful for alerts and analytics. */
export const CheckErrorKind = {
  /** The target did not answer within the configured timeout. */
  Timeout: 'timeout',
  /** Hostname could not be resolved. */
  Dns: 'dns',
  /** TCP connection could not be established (refused/unreachable). */
  Connection: 'connection',
  /** TLS/SSL negotiation failed (expired/invalid certificate, handshake). */
  Tls: 'tls',
  /** Protocol responded but with an unacceptable status (e.g. HTTP 500). */
  HttpStatus: 'http_status',
  /** Response violated the protocol or an assertion (unexpected body, etc.). */
  Protocol: 'protocol',
  /** Anything not covered above. */
  Unknown: 'unknown',
} as const;
export type CheckErrorKind = (typeof CheckErrorKind)[keyof typeof CheckErrorKind];

/** Structured description of why a check failed. */
export interface CheckError {
  readonly kind: CheckErrorKind;
  readonly message: string;
}

/**
 * Immutable result of a single probe.
 *
 * `responseMs` is the measured round-trip latency in milliseconds, or `null`
 * when latency could not be measured (e.g. DNS failure before any connection).
 */
export interface CheckOutcome {
  readonly up: boolean;
  readonly responseMs: number | null;
  /** Protocol status code when applicable (HTTP status code, etc.). */
  readonly statusCode?: number;
  /** Present when `up` is `false`. */
  readonly error?: CheckError;
}

/** Convenience constructor for a successful outcome. */
export function outcomeUp(responseMs: number, statusCode?: number): CheckOutcome {
  return statusCode === undefined ? { up: true, responseMs } : { up: true, responseMs, statusCode };
}

/** Convenience constructor for a failed outcome. */
export function outcomeDown(
  error: CheckError,
  responseMs: number | null = null,
  statusCode?: number,
): CheckOutcome {
  return statusCode === undefined
    ? { up: false, responseMs, error }
    : { up: false, responseMs, statusCode, error };
}

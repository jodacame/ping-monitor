import { type CheckError, CheckErrorKind } from '@ping/core';

/** Node/undici error codes that indicate a TLS/certificate problem. */
const TLS_CODES = new Set([
  'CERT_HAS_EXPIRED',
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_TLS_CERT_ALTNAME_INVALID',
  'CERT_NOT_YET_VALID',
  'ERR_SSL_WRONG_VERSION_NUMBER',
]);

/** Extract a low-level error code from an Error or its `cause` chain. */
function errorCode(err: unknown): string | undefined {
  const direct = (err as { code?: unknown }).code;
  if (typeof direct === 'string') return direct;
  const cause = (err as { cause?: unknown }).cause;
  if (cause && cause !== err) return errorCode(cause);
  return undefined;
}

/**
 * Classify a thrown network/fetch error into a structured `CheckError`.
 * Keeps error taxonomy in one place so every executor reports consistently.
 */
export function classifyNetworkError(err: unknown): CheckError {
  if (err instanceof Error && err.name === 'AbortError') {
    return { kind: CheckErrorKind.Timeout, message: 'Request timed out' };
  }

  const code = errorCode(err);
  if (code) {
    if (TLS_CODES.has(code)) {
      return { kind: CheckErrorKind.Tls, message: `TLS error: ${code}` };
    }
    switch (code) {
      case 'ENOTFOUND':
      case 'EAI_AGAIN':
        return { kind: CheckErrorKind.Dns, message: 'DNS resolution failed' };
      case 'ECONNREFUSED':
        return { kind: CheckErrorKind.Connection, message: 'Connection refused' };
      case 'ECONNRESET':
        return { kind: CheckErrorKind.Connection, message: 'Connection reset' };
      case 'EHOSTUNREACH':
      case 'ENETUNREACH':
        return { kind: CheckErrorKind.Connection, message: 'Host unreachable' };
      case 'ETIMEDOUT':
      case 'UND_ERR_CONNECT_TIMEOUT':
      case 'UND_ERR_HEADERS_TIMEOUT':
        return { kind: CheckErrorKind.Timeout, message: 'Connection timed out' };
      default:
        break;
    }
  }

  const message = err instanceof Error ? err.message : 'Unknown error';
  return { kind: CheckErrorKind.Unknown, message };
}

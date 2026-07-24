/**
 * Application error hierarchy.
 *
 * Every expected failure is modelled as an `AppError` carrying a stable machine
 * code and an HTTP status. The API layer maps these to responses; nothing else
 * needs try/catch noise or ad-hoc status juggling.
 */

/** Stable, machine-readable error codes exposed to API clients. */
export const ErrorCode = {
  Validation: 'validation_error',
  Unauthorized: 'unauthorized',
  Forbidden: 'forbidden',
  NotFound: 'not_found',
  Conflict: 'conflict',
  RateLimited: 'rate_limited',
  Internal: 'internal_error',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Base class for all expected, mapped application errors. */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(message: string, code: ErrorCode, statusCode: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.statusCode = statusCode;
    if (details !== undefined) this.details = details;
    Error.captureStackTrace?.(this, new.target);
  }
}

export class ValidationError extends AppError {
  constructor(message = 'Validation failed', details?: unknown) {
    super(message, ErrorCode.Validation, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, ErrorCode.Unauthorized, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied') {
    super(message, ErrorCode.Forbidden, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, ErrorCode.NotFound, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Resource conflict', details?: unknown) {
    super(message, ErrorCode.Conflict, 409, details);
  }
}

/** Narrowing helper. */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

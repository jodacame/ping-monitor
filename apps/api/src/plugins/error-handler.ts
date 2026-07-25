import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode, isAppError } from '@ping/core';
import type { AppContext } from '../context.js';

/**
 * Central error handler. Maps domain `AppError`s and Zod validation failures to
 * consistent JSON envelopes `{ error: { code, message, details? } }`, and hides
 * internals behind a generic 500 while logging the real cause.
 */
/** Map a non-domain HTTP status onto the public error-code vocabulary. */
function codeForStatus(status: number): ErrorCode {
  switch (status) {
    case 401:
      return ErrorCode.Unauthorized;
    case 403:
      return ErrorCode.Forbidden;
    case 404:
      return ErrorCode.NotFound;
    case 409:
      return ErrorCode.Conflict;
    case 429:
      return ErrorCode.RateLimited;
    default:
      return ErrorCode.Validation;
  }
}

export function registerErrorHandler(app: FastifyInstance, ctx: AppContext): void {
  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof ZodError) {
      void reply.status(400).send({
        error: {
          code: ErrorCode.Validation,
          message: 'Request validation failed',
          details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
      return;
    }

    if (isAppError(error)) {
      void reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined ? { details: error.details } : {}),
        },
      });
      return;
    }

    // Errors raised by Fastify itself or by plugins (rate limiting, payload
    // limits) carry a statusCode < 500 but no domain code, so derive one from
    // the status instead of labelling everything a validation error.
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode < 500) {
      void reply.status(statusCode).send({
        error: { code: codeForStatus(statusCode), message: error.message },
      });
      return;
    }

    ctx.logger.error({ err: error, url: request.url }, 'unhandled request error');
    void reply.status(500).send({
      error: { code: ErrorCode.Internal, message: 'Internal server error' },
    });
  });

  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({
      error: { code: ErrorCode.NotFound, message: `Route ${request.method} ${request.url} not found` },
    });
  });
}

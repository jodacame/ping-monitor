import type { FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCode, isAppError } from '@ping/core';
import type { AppContext } from '../context.js';

/**
 * Central error handler. Maps domain `AppError`s and Zod validation failures to
 * consistent JSON envelopes `{ error: { code, message, details? } }`, and hides
 * internals behind a generic 500 while logging the real cause.
 */
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

    // Fastify's own validation / payload errors carry a statusCode < 500.
    const statusCode = typeof error.statusCode === 'number' ? error.statusCode : 500;
    if (statusCode < 500) {
      void reply.status(statusCode).send({
        error: { code: ErrorCode.Validation, message: error.message },
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

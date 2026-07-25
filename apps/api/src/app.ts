import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import { createHash } from 'node:crypto';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppContext } from './context.js';
import { buildOpenApiDocument } from './docs/openapi.js';
import { isApiKey } from './services/api-key-service.js';
import { registerErrorHandler } from './plugins/error-handler.js';
import { registerRoutes } from './routes/index.js';
import type { WsSocket } from './ws/hub.js';

/**
 * Rate-limit bucket for a presented API key, or null when the caller is not
 * using one. The token is hashed so the counter key never holds a credential.
 */
function apiKeyRateLimitBucket(authorization: string | undefined): string | null {
  const token = authorization?.toLowerCase().startsWith('bearer ')
    ? authorization.slice(7).trim()
    : null;
  if (!token || !isApiKey(token)) return null;
  return `key:${createHash('sha256').update(token).digest('hex').slice(0, 32)}`;
}

/** Version reported by the OpenAPI document. */
const API_VERSION = '0.1.0';

/** Max concurrent WebSocket connections per workspace (per process). */
const WS_MAX_PER_WORKSPACE = 50;
/** Heartbeat interval; unresponsive sockets are terminated. */
const WS_HEARTBEAT_MS = 30_000;
/** How often an open socket re-checks that its API key is still valid. */
const WS_REVALIDATE_MS = 60_000;
/** Sockets accepted but not yet authenticated, across all workspaces. */
const WS_MAX_PENDING_AUTH = 100;
/** How long a socket may stay unauthenticated before it is dropped. */
const WS_AUTH_TIMEOUT_MS = 5_000;
/** Grace period between a polite close and a forced teardown. */
const WS_CLOSE_GRACE_MS = 1_000;

/**
 * Refuse a socket: tell the client why, close politely, then make sure it
 * actually goes away. A client that never completes the closing handshake would
 * otherwise hold the socket open indefinitely.
 */
function reject(ws: WsSocket, message: string): void {
  try {
    ws.send(JSON.stringify({ type: 'error', message }));
    ws.close();
  } catch {
    /* already gone */
  }
  setTimeout(() => {
    try {
      ws.terminate();
    } catch {
      /* already gone */
    }
  }, WS_CLOSE_GRACE_MS).unref();
}

/** Build a fully-configured Fastify instance for the given context. */
export async function buildApp(ctx: AppContext): Promise<FastifyInstance> {
  const app = Fastify({
    logger: false, // we use our own pino logger via ctx
    // Never trust `X-Forwarded-For` blindly: request.ip gates rate limiting and
    // API-key IP allowlists, so a blanket `true` lets any caller forge both.
    // Configured via TRUST_PROXY (see @ping/config); the Compose bundle sets it
    // to 1 because nginx is the only proxy in front of this service.
    trustProxy: ctx.apiConfig.trustProxy,
    // JSON-only API with small payloads (no uploads/bulk import). 256 KiB is 4x
    // tighter than Fastify's 1 MiB default and still fits the largest realistic
    // body — a status page referencing thousands of monitor ids.
    bodyLimit: 262_144, // 256 KiB
  });

  app.decorate('ctx', ctx);
  registerErrorHandler(app, ctx);

  // Upgrade guard: if more proxies forward to us than TRUST_PROXY accounts for,
  // request.ip resolves to a proxy rather than the caller, and every client
  // collapses into a single rate-limit bucket. Warn once instead of letting an
  // operator discover it as unexplained 429s.
  const trustedHops = typeof ctx.apiConfig.trustProxy === 'number' ? ctx.apiConfig.trustProxy : null;
  if (trustedHops !== null) {
    let warned = false;
    app.addHook('onRequest', (request, _reply, done) => {
      if (!warned) {
        const forwarded = request.headers['x-forwarded-for'];
        const hops = typeof forwarded === 'string' ? forwarded.split(',').length : 0;
        if (hops > trustedHops) {
          warned = true;
          ctx.logger.warn(
            { trustProxy: trustedHops, forwardedHops: hops, resolvedClientIp: request.ip },
            'X-Forwarded-For carries more hops than TRUST_PROXY trusts, so the resolved client IP ' +
              'may be a proxy and all callers may share one rate-limit bucket. If another proxy ' +
              'fronts this stack (Cloudflare Tunnel, Traefik, a load balancer), raise TRUST_PROXY ' +
              'to the real number of proxies.',
          );
        }
      }
      done();
    });
  }

  // Security headers (API returns JSON only, so CSP is not needed here).
  await app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  });

  // Global rate limit. Auth routes tighten this further. Backed by Redis so
  // counters are shared across API replicas (not per-process); on a Redis error
  // the plugin fails open rather than blocking traffic.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    hook: 'onRequest',
    redis: ctx.rateLimitRedis,
    nameSpace: 'ping-rl:',
    // Bucket per API key when one is presented, otherwise per client IP. This
    // runs before authentication, so the key is identified from the header
    // alone (hashed, never used as a Redis key in the clear). Without it, every
    // key behind one address — a CI runner, a NAT gateway — shares one budget.
    keyGenerator: (request) => apiKeyRateLimitBucket(request.headers.authorization) ?? request.ip,
  });

  await app.register(cors, {
    origin: ctx.apiConfig.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  });
  await app.register(websocket);

  /** Sockets currently awaiting their API-key lookup (see WS_MAX_PENDING_AUTH). */
  let pendingAuth = 0;

  await app.register(
    async (instance) => {
      registerRoutes(instance, ctx);

      // Interactive API reference. The document is built from the same zod
      // schemas the handlers validate with, and `test/openapi.test.ts` fails if
      // a route is missing from it, so it cannot drift. The API shape is not a
      // secret (this is open source), so it needs no authentication.
      const document = buildOpenApiDocument(API_VERSION);
      await instance.register(swagger, { mode: 'static', specification: { document } });
      await instance.register(swaggerUi, {
        routePrefix: '/docs',
        uiConfig: { docExpansion: 'list', deepLinking: true },
      });
      instance.get('/openapi.json', () => document);

      // Real-time event stream. Auth via API key, sent either as the WebSocket
      // subprotocol (preferred — never logged in URLs) or a ?apiKey= param.
      instance.get('/ws', { websocket: true }, (socket, request) => {
        const ws = socket as unknown as WsSocket;
        const proto = request.headers['sec-websocket-protocol'];
        const fromProto = typeof proto === 'string' ? proto.split(',')[0]?.trim() : undefined;
        const key = fromProto || (request.query as { apiKey?: string }).apiKey || '';

        // The upgrade completes before the key can be checked, so unauthenticated
        // sockets are budgeted and time-limited: otherwise anyone could hold
        // sockets open for free while their lookups are in flight.
        if (pendingAuth >= WS_MAX_PENDING_AUTH) {
          reject(ws, 'Server busy, retry shortly');
          return;
        }
        pendingAuth += 1;
        let settled = false;
        const authTimer = setTimeout(() => {
          if (settled) return;
          settled = true;
          pendingAuth -= 1;
          reject(ws, 'Authentication timed out');
        }, WS_AUTH_TIMEOUT_MS);

        void ctx.apiKeys.verify(key, request.ip).then((auth) => {
          if (settled) return;
          settled = true;
          clearTimeout(authTimer);
          pendingAuth -= 1;

          if (!auth) {
            reject(ws, 'Invalid or missing API key');
            return;
          }
          if (ctx.wsHub.count(auth.workspacePublicId) >= WS_MAX_PER_WORKSPACE) {
            reject(ws, 'Too many connections');
            return;
          }

          ctx.wsHub.add(auth.workspacePublicId, ws);
          ws.send(JSON.stringify({ type: 'connected', workspaceId: auth.workspacePublicId }));

          // Heartbeat: drop connections that stop responding to pings.
          let alive = true;
          ws.on('pong', () => {
            alive = true;
          });
          const heartbeat = setInterval(() => {
            if (!alive) {
              ws.terminate();
              return;
            }
            alive = false;
            try {
              ws.ping();
            } catch {
              /* ignore */
            }
          }, WS_HEARTBEAT_MS);

          // A key is checked once, at connect time, so a long-lived socket would
          // otherwise keep streaming after the key is revoked or expires.
          // Re-check periodically and drop the connection when it stops being
          // valid.
          const revalidate = setInterval(() => {
            void ctx.apiKeys
              .isActive(auth.keyId)
              .then((active) => {
                if (active) return;
                try {
                  ws.send(JSON.stringify({ type: 'error', message: 'API key is no longer valid' }));
                } catch {
                  /* socket already gone */
                }
                ws.terminate();
              })
              .catch(() => {
                // A transient database error must not disconnect a healthy
                // client; the next tick tries again.
              });
          }, WS_REVALIDATE_MS);

          ws.on('close', () => {
            clearInterval(heartbeat);
            clearInterval(revalidate);
            ctx.wsHub.remove(auth.workspacePublicId, ws);
          });
        });
      });
    },
    { prefix: '/api' },
  );

  return app;
}

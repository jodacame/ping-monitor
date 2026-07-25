import type { OpenAPIV3 } from 'openapi-types';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CHECK_INTERVALS_SECONDS } from '@ping/core';
import {
  changePasswordSchema,
  createApiKeySchema,
  createChannelSchema,
  createGroupSchema,
  createMonitorSchema,
  createStatusPageSchema,
  createTagSchema,
  createWorkspaceSchema,
  loginSchema,
  refreshSchema,
  registerSchema,
  updateChannelSchema,
  updateGroupSchema,
  updateMonitorSchema,
  updateStatusPageSchema,
} from '../routes/schemas.js';

/**
 * OpenAPI description of the public API.
 *
 * Request bodies are derived from the very zod schemas the handlers validate
 * with, so they cannot drift from the implementation. Route coverage is pinned
 * by `test/openapi.test.ts`, which fails when a registered route is missing
 * here — the two together are what keep this document honest.
 */

type Json = Record<string, unknown>;
/** Whatever zod-to-json-schema accepts — avoids leaking `any` from ZodTypeAny. */
type ConvertibleSchema = Parameters<typeof zodToJsonSchema>[0];

/** Convert a zod schema to inline JSON Schema (no $refs, OpenAPI 3 dialect). */
function body(schema: ConvertibleSchema): Json {
  const json = zodToJsonSchema(schema, { target: 'openApi3', $refStrategy: 'none' }) as Json;
  delete json.$schema;
  return json;
}

const ref = (name: string): Json => ({ $ref: `#/components/schemas/${name}` });
const array = (items: Json): Json => ({ type: 'array', items });

/** A JSON response with the given schema. */
function json(description: string, schema: Json): Json {
  return { description, content: { 'application/json': { schema } } };
}

function jsonBody(schema: ConvertibleSchema): Json {
  return { required: true, content: { 'application/json': { schema: body(schema) } } };
}

const ERRORS: Record<number, Json> = {
  400: json('Validation failed', ref('Error')),
  401: json('Missing, invalid or expired credentials', ref('Error')),
  403: json('Authenticated but not allowed (wrong workspace, read-only key, user-only route)', ref('Error')),
  404: json('Not found', ref('Error')),
  409: json('Conflict', ref('Error')),
  429: json('Rate limit exceeded — see the X-RateLimit-* and Retry-After headers', ref('Error')),
};

/** Pick a subset of the shared error responses. */
function errors(...codes: number[]): Json {
  return Object.fromEntries(codes.map((code) => [code, ERRORS[code]!]));
}

const workspaceParam: Json = {
  name: 'workspaceId',
  in: 'path',
  required: true,
  description: 'Public workspace id. Read it from `GET /workspaces`, or from `GET /auth/me`.',
  schema: { type: 'string' },
};

function pathParam(name: string, description: string): Json {
  return { name, in: 'path', required: true, description, schema: { type: 'string' } };
}

function query(name: string, schema: Json, description: string): Json {
  return { name, in: 'query', required: false, description, schema };
}

// --- Response schemas --------------------------------------------------------
// These mirror the serializers in `routes/serializers.ts` and the service DTOs.

const nullableString: Json = { type: 'string', nullable: true };
const nullableNumber: Json = { type: 'number', nullable: true };
const dateTime: Json = { type: 'string', format: 'date-time' };
const nullableDateTime: Json = { type: 'string', format: 'date-time', nullable: true };

const monitorStatus: Json = {
  type: 'string',
  enum: ['pending', 'up', 'down', 'paused'],
  description: 'Current public status of the monitor.',
};

/** Fields shared by every monitor representation. */
const monitorBase: Json = {
  id: { type: 'string' },
  name: { type: 'string' },
  type: { type: 'string', enum: ['http', 'tcp', 'icmp'] },
  target: { type: 'string' },
  config: { type: 'object', additionalProperties: true },
  intervalSeconds: { type: 'integer', enum: [...CHECK_INTERVALS_SECONDS] },
  timeoutMs: { type: 'integer' },
  failureThreshold: { type: 'integer' },
  recoveryThreshold: { type: 'integer' },
  quorum: { type: 'integer', description: 'Regions that must agree before the status flips.' },
  enabled: { type: 'boolean', description: 'False while the monitor is paused.' },
  status: monitorStatus,
  lastCheckedAt: nullableDateTime,
  lastStatusChangedAt: nullableDateTime,
  lastResponseMs: nullableNumber,
  groupId: nullableString,
  groupName: nullableString,
  tags: array(ref('Tag')),
  channelIds: array({ type: 'string' }),
  createdAt: dateTime,
  updatedAt: dateTime,
};

const schemas: Record<string, Json> = {
  Error: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'object',
        required: ['code', 'message'],
        properties: {
          code: {
            type: 'string',
            enum: [
              'validation_error',
              'unauthorized',
              'forbidden',
              'not_found',
              'conflict',
              'rate_limited',
              'internal_error',
            ],
          },
          message: { type: 'string' },
          details: {
            type: 'array',
            description: 'Present on validation errors: which field failed and why.',
            items: {
              type: 'object',
              properties: { path: { type: 'string' }, message: { type: 'string' } },
            },
          },
        },
      },
    },
  },

  RegistrationStatus: {
    type: 'object',
    properties: {
      needsSetup: {
        type: 'boolean',
        description: 'True on a clean install with no users yet; the first account is always allowed.',
      },
      registrationOpen: {
        type: 'boolean',
        description: 'Whether POST /auth/register is currently accepted (ALLOW_REGISTRATION).',
      },
    },
  },

  User: {
    type: 'object',
    properties: { id: { type: 'string' }, email: { type: 'string' }, name: nullableString },
  },

  Session: {
    type: 'object',
    description: 'A new session. Store the refresh token securely; it rotates on every refresh.',
    properties: {
      accessToken: { type: 'string' },
      refreshToken: { type: 'string' },
      expiresIn: { type: 'integer', description: 'Access-token lifetime in seconds.' },
      user: ref('User'),
    },
  },

  Workspace: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      slug: { type: 'string' },
      role: {
        type: 'string',
        enum: ['owner', 'admin', 'member', 'viewer'],
        description:
          'Informational only today: no endpoint restricts access by role, so every member has full access to the workspace.',
      },
    },
  },

  Region: {
    type: 'object',
    description: 'A probe region. Use its numeric id in a monitor’s regionIds.',
    properties: {
      id: { type: 'integer' },
      code: { type: 'string' },
      name: { type: 'string' },
      enabled: { type: 'boolean' },
    },
  },

  Tag: {
    type: 'object',
    properties: { id: { type: 'string' }, name: { type: 'string' }, color: { type: 'string' } },
  },

  Monitor: {
    type: 'object',
    description: 'A monitor as returned by create, detail and update.',
    properties: { ...monitorBase, regionIds: array({ type: 'integer' }) },
  },

  MonitorListItem: {
    type: 'object',
    description:
      'A monitor as returned by the list endpoint. It carries display data (uptime24h, bars) instead of regionIds; fetch the detail endpoint when you need the regions.',
    properties: {
      ...monitorBase,
      uptime24h: { ...nullableNumber, description: 'Ratio between 0 and 1, or null without data.' },
      bars: {
        type: 'array',
        description: 'Compact recent-history buckets used by the dashboard.',
        items: { type: 'object', additionalProperties: true },
      },
    },
  },

  MonitorPage: {
    type: 'object',
    properties: {
      items: array(ref('MonitorListItem')),
      page: { type: 'integer' },
      pageSize: { type: 'integer' },
      total: { type: 'integer' },
    },
  },

  Overview: {
    type: 'object',
    description: 'Monitor counts by status for the workspace.',
    properties: {
      total: { type: 'integer' },
      up: { type: 'integer' },
      down: { type: 'integer' },
      paused: { type: 'integer' },
      pending: { type: 'integer' },
    },
  },

  Insights: {
    type: 'object',
    properties: {
      uptime: { ...nullableNumber, description: 'Ratio between 0 and 1 over the last 24h.' },
      avgLatencyMs: nullableNumber,
      incidents24h: { type: 'integer' },
    },
  },

  MonitorStats: {
    type: 'object',
    properties: {
      window: { type: 'string', enum: ['24h', '7d', '30d'] },
      summary: {
        type: 'object',
        properties: {
          checksTotal: { type: 'integer' },
          checksUp: { type: 'integer' },
          uptime: nullableNumber,
          avgLatencyMs: nullableNumber,
          minLatencyMs: nullableNumber,
          maxLatencyMs: nullableNumber,
        },
      },
      series: {
        type: 'array',
        description: 'Time buckets over the window.',
        items: { type: 'object', additionalProperties: true },
      },
    },
  },

  Check: {
    type: 'object',
    description: 'One recorded check result.',
    additionalProperties: true,
    properties: {
      checkedAt: dateTime,
      status: monitorStatus,
      responseMs: nullableNumber,
      error: nullableString,
    },
  },

  Incident: {
    type: 'object',
    description: 'A down period.',
    additionalProperties: true,
    properties: {
      id: { type: 'string' },
      startedAt: dateTime,
      resolvedAt: nullableDateTime,
      causeMessage: nullableString,
    },
  },

  Channel: {
    type: 'object',
    description:
      'A notification channel. Secrets in `config` (passwords, tokens, and the sensitive tail of webhook URLs) are masked with ••••••. Send a masked value back unchanged on update and the stored secret is kept.',
    properties: {
      id: { type: 'string' },
      type: { type: 'string', enum: ['smtp', 'telegram', 'webhook'] },
      name: { type: 'string' },
      config: { type: 'object', additionalProperties: true },
      enabled: { type: 'boolean' },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },

  ChannelTestResult: {
    type: 'object',
    properties: { ok: { type: 'boolean' }, error: { type: 'string' } },
  },

  Group: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      sortOrder: { type: 'integer' },
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },

  StatusPageSummary: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      slug: { type: 'string' },
      title: { type: 'string' },
      description: nullableString,
      updatedAt: dateTime,
    },
  },

  StatusPage: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      slug: {
        type: 'string',
        description: 'Generated from the title when not supplied, with a suffix on collision.',
      },
      title: { type: 'string' },
      description: nullableString,
      monitorIds: array({ type: 'string' }),
      createdAt: dateTime,
      updatedAt: dateTime,
    },
  },

  PublicStatusPage: {
    type: 'object',
    description: 'Public projection of a status page. No authentication, no ids.',
    properties: {
      title: { type: 'string' },
      description: nullableString,
      updatedAt: dateTime,
      monitors: array({
        type: 'object',
        properties: {
          name: { type: 'string' },
          status: monitorStatus,
          uptime24h: nullableNumber,
          bars: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
      }),
    },
  },

  ApiKey: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      prefix: { type: 'string', description: 'Masked start of the key, for identification only.' },
      scopes: array({ type: 'string', enum: ['read', 'write'] }),
      expiresAt: nullableDateTime,
      allowedIps: { ...array({ type: 'string' }), nullable: true },
      lastUsedAt: { ...nullableDateTime, description: 'Updated at most once per minute.' },
      createdAt: dateTime,
    },
  },

  ApiKeyCreated: {
    allOf: [
      ref('ApiKey'),
      {
        type: 'object',
        required: ['key'],
        properties: {
          key: {
            type: 'string',
            description: 'The full key. Returned ONLY here, exactly once — it cannot be retrieved again.',
          },
        },
      },
    ],
  },

  Health: { type: 'object', properties: { status: { type: 'string' } } },

  Acknowledgement: {
    type: 'object',
    description: 'The action succeeded. No representation of the affected resource is returned.',
    properties: { ok: { type: 'boolean' } },
  },
};

// --- Paths -------------------------------------------------------------------

const userAuth = [{ userToken: [] }];
const anyAuth = [{ apiKey: [] }, { userToken: [] }];

const W = '/workspaces/{workspaceId}';

const paths: Record<string, Json> = {
  '/health': {
    get: {
      tags: ['Service'],
      summary: 'Liveness probe',
      security: [],
      responses: { 200: json('The process is up', ref('Health')) },
    },
  },
  '/health/ready': {
    get: {
      tags: ['Service'],
      summary: 'Readiness probe',
      description: 'Returns 503 when the database cannot be reached.',
      security: [],
      responses: {
        200: json('Dependencies reachable', ref('Health')),
        503: json('Not ready', ref('Health')),
      },
    },
  },

  '/auth/registration': {
    get: {
      tags: ['Authentication'],
      summary: 'Whether sign-up is currently open',
      description: 'Public. Lets a client choose between first-run onboarding, login-only, or open sign-up.',
      security: [],
      responses: { 200: json('Registration state', ref('RegistrationStatus')) },
    },
  },
  '/auth/register': {
    post: {
      tags: ['Authentication'],
      summary: 'Create an account',
      description:
        'The first account on a clean install is always allowed. Afterwards this returns 403 unless ALLOW_REGISTRATION is enabled. Rate limited to 10 requests per minute.',
      security: [],
      requestBody: jsonBody(registerSchema),
      responses: { 201: json('Account created and signed in', ref('Session')), ...errors(400, 403, 409, 429) },
    },
  },
  '/auth/login': {
    post: {
      tags: ['Authentication'],
      summary: 'Sign in',
      description: 'Rate limited to 10 requests per minute.',
      security: [],
      requestBody: jsonBody(loginSchema),
      responses: { 200: json('Signed in', ref('Session')), ...errors(400, 401, 429) },
    },
  },
  '/auth/refresh': {
    post: {
      tags: ['Authentication'],
      summary: 'Exchange a refresh token for a new session',
      description: 'The presented refresh token is revoked and replaced (rotation).',
      security: [],
      requestBody: jsonBody(refreshSchema),
      responses: { 200: json('New session', ref('Session')), ...errors(400, 401) },
    },
  },
  '/auth/logout': {
    post: {
      tags: ['Authentication'],
      summary: 'Revoke a refresh token',
      security: [],
      requestBody: jsonBody(refreshSchema),
      responses: {
        200: json('Always succeeds, even for an unknown token', ref('Acknowledgement')),
        ...errors(400),
      },
    },
  },
  '/auth/whoami': {
    get: {
      tags: ['Authentication'],
      summary: 'Identify the calling credential',
      description:
        'Works with either an API key or a user token. With a key it returns that key’s workspace and scopes, which is how an integration discovers the workspace id it needs for every other call. With a user token it returns the user and their workspaces.',
      security: anyAuth,
      responses: {
        200: json('The calling principal', {
          oneOf: [
            {
              type: 'object',
              title: 'API key',
              properties: {
                principal: { type: 'string', enum: ['api_key'] },
                workspaceId: { type: 'string' },
                scopes: array({ type: 'string', enum: ['read', 'write'] }),
                expiresAt: nullableDateTime,
              },
            },
            {
              type: 'object',
              title: 'User',
              properties: {
                principal: { type: 'string', enum: ['user'] },
                user: ref('User'),
                workspaces: array(ref('Workspace')),
              },
            },
          ],
        }),
        ...errors(401),
      },
    },
  },

  '/auth/me': {
    get: {
      tags: ['Authentication'],
      summary: 'The signed-in user and their workspaces',
      description: 'User sessions only. An API key gets 403 — it belongs to a workspace, not a person.',
      security: userAuth,
      responses: {
        200: json('Current user', {
          type: 'object',
          properties: { user: ref('User'), workspaces: array(ref('Workspace')) },
        }),
        ...errors(401, 403),
      },
    },
  },
  '/auth/change-password': {
    post: {
      tags: ['Authentication'],
      summary: 'Change your password',
      description:
        'Verifies the current password, then revokes every other session and returns a fresh one, so the caller stays signed in while other devices are signed out. User sessions only. Rate limited to 10 requests per minute.',
      security: userAuth,
      requestBody: jsonBody(changePasswordSchema),
      responses: { 200: json('Password changed, new session issued', ref('Session')), ...errors(400, 401, 403, 429) },
    },
  },

  '/workspaces': {
    get: {
      tags: ['Workspaces'],
      summary: 'List the workspaces you belong to',
      description: 'User sessions only. This is where a workspaceId comes from.',
      security: userAuth,
      responses: { 200: json('Your workspaces', array(ref('Workspace'))), ...errors(401, 403) },
    },
    post: {
      tags: ['Workspaces'],
      summary: 'Create a workspace',
      description: 'User sessions only. You become its owner.',
      security: userAuth,
      requestBody: jsonBody(createWorkspaceSchema),
      responses: { 201: json('Created', ref('Workspace')), ...errors(400, 401, 403) },
    },
  },
  '/regions': {
    get: {
      tags: ['Workspaces'],
      summary: 'List probe regions',
      description: 'Regions are global, not per workspace. Use these ids in a monitor’s regionIds.',
      security: anyAuth,
      responses: { 200: json('Regions', array(ref('Region'))), ...errors(401) },
    },
  },

  [`${W}/overview`]: {
    get: {
      tags: ['Dashboard'],
      summary: 'Monitor counts by status',
      security: anyAuth,
      parameters: [workspaceParam],
      responses: { 200: json('Counts', ref('Overview')), ...errors(401, 403) },
    },
  },
  [`${W}/insights`]: {
    get: {
      tags: ['Dashboard'],
      summary: 'Uptime, latency and incident count over the last 24h',
      description:
        'Always the last 24 hours; there is no window parameter. Passing `window` returns 400 rather than silently ignoring it — use /monitors/{monitorId}/stats for other periods.',
      security: anyAuth,
      parameters: [workspaceParam],
      responses: { 200: json('Insights', ref('Insights')), ...errors(400, 401, 403) },
    },
  },

  [`${W}/monitors`]: {
    get: {
      tags: ['Monitors'],
      summary: 'List monitors',
      security: anyAuth,
      parameters: [
        workspaceParam,
        query('status', { type: 'string', enum: ['up', 'down', 'paused', 'pending'] }, 'Filter by status.'),
        query('tagId', { type: 'string' }, 'Filter by tag.'),
        query('search', { type: 'string', maxLength: 200 }, 'Match against name and target.'),
        query('page', { type: 'integer', minimum: 1, default: 1 }, 'Page number, 1-based.'),
        query('pageSize', { type: 'integer', minimum: 1, maximum: 100, default: 20 }, 'Items per page.'),
      ],
      responses: { 200: json('A page of monitors', ref('MonitorPage')), ...errors(400, 401, 403) },
    },
    post: {
      tags: ['Monitors'],
      summary: 'Create a monitor',
      description:
        'intervalSeconds must be one of 30, 60, 300 or 900. Leave regionIds empty to use the default region; set it together with quorum for multi-region checks.',
      security: anyAuth,
      parameters: [workspaceParam],
      requestBody: jsonBody(createMonitorSchema),
      responses: { 201: json('Created', ref('Monitor')), ...errors(400, 401, 403) },
    },
  },
  [`${W}/monitors/{monitorId}`]: {
    get: {
      tags: ['Monitors'],
      summary: 'Monitor detail',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('monitorId', 'Public monitor id.')],
      responses: { 200: json('The monitor', ref('Monitor')), ...errors(401, 403, 404) },
    },
    patch: {
      tags: ['Monitors'],
      summary: 'Update a monitor',
      description: 'Send only the fields you want to change. At least one is required.',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('monitorId', 'Public monitor id.')],
      requestBody: jsonBody(updateMonitorSchema),
      responses: { 200: json('Updated', ref('Monitor')), ...errors(400, 401, 403, 404) },
    },
    delete: {
      tags: ['Monitors'],
      summary: 'Delete a monitor',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('monitorId', 'Public monitor id.')],
      responses: { 204: { description: 'Deleted' }, ...errors(401, 403, 404) },
    },
  },
  [`${W}/monitors/{monitorId}/pause`]: {
    post: {
      tags: ['Monitors'],
      summary: 'Pause a monitor',
      description:
        'Stops scheduling checks and sets the status to paused. Returns an acknowledgement, not the monitor — re-read the detail endpoint if you need the updated object.',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('monitorId', 'Public monitor id.')],
      responses: { 200: json('Paused', ref('Acknowledgement')), ...errors(401, 403, 404) },
    },
  },
  [`${W}/monitors/{monitorId}/resume`]: {
    post: {
      tags: ['Monitors'],
      summary: 'Resume a monitor',
      description:
        'Schedules the next check immediately and resets the status to pending. Returns an acknowledgement, not the monitor.',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('monitorId', 'Public monitor id.')],
      responses: { 200: json('Resumed', ref('Acknowledgement')), ...errors(401, 403, 404) },
    },
  },
  [`${W}/monitors/{monitorId}/stats`]: {
    get: {
      tags: ['Monitors'],
      summary: 'Uptime and latency over a window',
      security: anyAuth,
      parameters: [
        workspaceParam,
        pathParam('monitorId', 'Public monitor id.'),
        query('window', { type: 'string', enum: ['24h', '7d', '30d'], default: '24h' }, 'Any other value returns 400.'),
      ],
      responses: { 200: json('Statistics', ref('MonitorStats')), ...errors(400, 401, 403, 404) },
    },
  },
  [`${W}/monitors/{monitorId}/checks`]: {
    get: {
      tags: ['Monitors'],
      summary: 'Recent check results',
      security: anyAuth,
      parameters: [
        workspaceParam,
        pathParam('monitorId', 'Public monitor id.'),
        query('limit', { type: 'integer', minimum: 1, maximum: 200, default: 50 }, 'How many to return.'),
      ],
      responses: { 200: json('Most recent first', array(ref('Check'))), ...errors(400, 401, 403, 404) },
    },
  },
  [`${W}/monitors/{monitorId}/incidents`]: {
    get: {
      tags: ['Monitors'],
      summary: 'Incident history',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('monitorId', 'Public monitor id.')],
      responses: { 200: json('Most recent first', array(ref('Incident'))), ...errors(401, 403, 404) },
    },
  },
  [`${W}/monitors/{monitorId}/export.csv`]: {
    get: {
      tags: ['Monitors'],
      summary: 'Export check history as CSV',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('monitorId', 'Public monitor id.')],
      responses: {
        200: { description: 'CSV file', content: { 'text/csv': { schema: { type: 'string' } } } },
        ...errors(401, 403, 404),
      },
    },
  },

  [`${W}/channels`]: {
    get: {
      tags: ['Notification channels'],
      summary: 'List channels',
      description: 'Secrets in config are masked.',
      security: anyAuth,
      parameters: [workspaceParam],
      responses: { 200: json('Channels', array(ref('Channel'))), ...errors(401, 403) },
    },
    post: {
      tags: ['Notification channels'],
      summary: 'Create a channel',
      description:
        'config is validated against the channel type: smtp needs host/port/from/to (username/password optional), telegram needs botToken and chatId, webhook needs url (with optional method, headers, auth and bodyTemplate).',
      security: anyAuth,
      parameters: [workspaceParam],
      requestBody: jsonBody(createChannelSchema),
      responses: { 201: json('Created', ref('Channel')), ...errors(400, 401, 403) },
    },
  },
  [`${W}/channels/{channelId}`]: {
    get: {
      tags: ['Notification channels'],
      summary: 'Channel detail',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('channelId', 'Public channel id.')],
      responses: { 200: json('The channel', ref('Channel')), ...errors(401, 403, 404) },
    },
    patch: {
      tags: ['Notification channels'],
      summary: 'Update a channel',
      description:
        'The type cannot change. Masked secret values sent back unchanged keep the stored secret, so a read-then-write round trip is safe.',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('channelId', 'Public channel id.')],
      requestBody: jsonBody(updateChannelSchema),
      responses: { 200: json('Updated', ref('Channel')), ...errors(400, 401, 403, 404) },
    },
    delete: {
      tags: ['Notification channels'],
      summary: 'Delete a channel',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('channelId', 'Public channel id.')],
      responses: { 204: { description: 'Deleted' }, ...errors(401, 403, 404) },
    },
  },
  [`${W}/channels/{channelId}/test`]: {
    post: {
      tags: ['Notification channels'],
      summary: 'Send a test notification',
      description: 'Never throws on delivery failure: the outcome is in the response body.',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('channelId', 'Public channel id.')],
      responses: { 200: json('Delivery outcome', ref('ChannelTestResult')), ...errors(401, 403, 404) },
    },
  },

  [`${W}/groups`]: {
    get: {
      tags: ['Groups'],
      summary: 'List monitor groups',
      security: anyAuth,
      parameters: [workspaceParam],
      responses: { 200: json('Groups', array(ref('Group'))), ...errors(401, 403) },
    },
    post: {
      tags: ['Groups'],
      summary: 'Create a group',
      security: anyAuth,
      parameters: [workspaceParam],
      requestBody: jsonBody(createGroupSchema),
      responses: { 201: json('Created', ref('Group')), ...errors(400, 401, 403) },
    },
  },
  [`${W}/groups/{groupId}`]: {
    patch: {
      tags: ['Groups'],
      summary: 'Update a group',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('groupId', 'Public group id.')],
      requestBody: jsonBody(updateGroupSchema),
      responses: { 200: json('Updated', ref('Group')), ...errors(400, 401, 403, 404) },
    },
    delete: {
      tags: ['Groups'],
      summary: 'Delete a group',
      description: 'Monitors in the group are kept; they simply become ungrouped.',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('groupId', 'Public group id.')],
      responses: { 204: { description: 'Deleted' }, ...errors(401, 403, 404) },
    },
  },

  [`${W}/tags`]: {
    get: {
      tags: ['Tags'],
      summary: 'List tags',
      security: anyAuth,
      parameters: [workspaceParam],
      responses: { 200: json('Tags', array(ref('Tag'))), ...errors(401, 403) },
    },
    post: {
      tags: ['Tags'],
      summary: 'Create a tag',
      security: anyAuth,
      parameters: [workspaceParam],
      requestBody: jsonBody(createTagSchema),
      responses: { 201: json('Created', ref('Tag')), ...errors(400, 401, 403) },
    },
  },
  [`${W}/tags/{tagId}`]: {
    delete: {
      tags: ['Tags'],
      summary: 'Delete a tag',
      description: 'Tags have no update endpoint; delete and recreate to rename.',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('tagId', 'Public tag id.')],
      responses: { 204: { description: 'Deleted' }, ...errors(401, 403, 404) },
    },
  },

  [`${W}/status-pages`]: {
    get: {
      tags: ['Status pages'],
      summary: 'List status pages',
      security: anyAuth,
      parameters: [workspaceParam],
      responses: { 200: json('Status pages', array(ref('StatusPageSummary'))), ...errors(401, 403) },
    },
    post: {
      tags: ['Status pages'],
      summary: 'Create a status page',
      description: 'When slug is omitted it is generated from the title; read it back from the response.',
      security: anyAuth,
      parameters: [workspaceParam],
      requestBody: jsonBody(createStatusPageSchema),
      responses: { 201: json('Created', ref('StatusPage')), ...errors(400, 401, 403) },
    },
  },
  [`${W}/status-pages/{pageId}`]: {
    get: {
      tags: ['Status pages'],
      summary: 'Status page detail',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('pageId', 'Public status page id.')],
      responses: { 200: json('The status page', ref('StatusPage')), ...errors(401, 403, 404) },
    },
    patch: {
      tags: ['Status pages'],
      summary: 'Update a status page',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('pageId', 'Public status page id.')],
      requestBody: jsonBody(updateStatusPageSchema),
      responses: { 200: json('Updated', ref('StatusPage')), ...errors(400, 401, 403, 404) },
    },
    delete: {
      tags: ['Status pages'],
      summary: 'Delete a status page',
      security: anyAuth,
      parameters: [workspaceParam, pathParam('pageId', 'Public status page id.')],
      responses: { 204: { description: 'Deleted' }, ...errors(401, 403, 404) },
    },
  },
  '/public/status/{slug}': {
    get: {
      tags: ['Status pages'],
      summary: 'Read a public status page',
      description: 'No authentication. Slugs are unique across the whole instance.',
      security: [],
      parameters: [pathParam('slug', 'Status page slug.')],
      responses: { 200: json('The public page', ref('PublicStatusPage')), ...errors(404) },
    },
  },

  [`${W}/api-keys`]: {
    get: {
      tags: ['API keys'],
      summary: 'List API keys',
      description: 'User sessions only — a key cannot manage keys. Never returns key material.',
      security: userAuth,
      parameters: [workspaceParam],
      responses: { 200: json('Keys', array(ref('ApiKey'))), ...errors(401, 403) },
    },
    post: {
      tags: ['API keys'],
      summary: 'Create an API key',
      description:
        'User sessions only. The full key is in the response and is never retrievable again. allowedIps entries must be valid IPv4/IPv6 addresses or CIDR blocks.',
      security: userAuth,
      parameters: [workspaceParam],
      requestBody: jsonBody(createApiKeySchema),
      responses: { 201: json('Created — copy the key now', ref('ApiKeyCreated')), ...errors(400, 401, 403) },
    },
  },
  [`${W}/api-keys/{keyId}`]: {
    delete: {
      tags: ['API keys'],
      summary: 'Revoke an API key',
      description:
        'User sessions only. Takes effect immediately for REST calls; an open WebSocket re-checks its key every minute and is dropped once it is revoked.',
      security: userAuth,
      parameters: [workspaceParam, pathParam('keyId', 'Public API key id.')],
      responses: { 204: { description: 'Revoked' }, ...errors(401, 403, 404) },
    },
  },
};

/**
 * The complete OpenAPI document served at /api/openapi.json.
 *
 * Composed as plain JSON and asserted to the OpenAPI type at this single
 * boundary; correctness is enforced by `test/openapi.test.ts` (route coverage,
 * dangling refs, required prose) rather than by the type alone.
 */
export function buildOpenApiDocument(version: string): OpenAPIV3.Document {
  const document = {
    openapi: '3.0.3',
    info: {
      title: 'Ping Monitor API',
      version,
      description: [
        'REST API and real-time WebSocket for Ping Monitor.',
        '',
        '## Authentication',
        '',
        'Two kinds of bearer token are accepted:',
        '',
        '- **API key** (`pk_…`) — belongs to one workspace, created under *Developers* in the app',
        '  or via `POST /workspaces/{workspaceId}/api-keys`. Intended for scripts and integrations.',
        '- **User access token** — a JWT from `POST /auth/login`, for acting as a person.',
        '',
        'Both go in the same header: `Authorization: Bearer <token>`.',
        '',
        'An API key works on every workspace endpoint of **its own** workspace and acts with',
        'admin-level access there, so treat it as a privileged credential. It is rejected on',
        'endpoints that act on a person or span workspaces (`/auth/me`, `/auth/change-password`,',
        '`/workspaces`, and the API-key endpoints themselves), which return 403.',
        '',
        '## Getting started',
        '',
        '1. `POST /auth/login` with your email and password.',
        '2. `GET /workspaces` to read your `workspaceId`.',
        '3. `POST /workspaces/{workspaceId}/api-keys` to mint a key (copy it — it is shown once).',
        '4. Call any workspace endpoint with `Authorization: Bearer pk_…`.',
        '',
        '## Scopes',
        '',
        'A key holds `read` and/or `write`. A read-only key may only use GET, HEAD and OPTIONS;',
        'anything else returns 403.',
        '',
        '## Rate limiting',
        '',
        '300 requests per minute by default, and 10 per minute on credential endpoints',
        '(`/auth/login`, `/auth/register`, `/auth/change-password`). Requests are counted per API',
        'key when one is presented, otherwise per client IP. Every response carries:',
        '',
        '| Header | Meaning |',
        '| --- | --- |',
        '| `x-ratelimit-limit` | Requests allowed in the current window |',
        '| `x-ratelimit-remaining` | Requests left in the window |',
        '| `x-ratelimit-reset` | Seconds until the window resets |',
        '| `retry-after` | Seconds to wait — sent only on a 429 |',
        '',
        'Exceeding the limit returns 429 with `error.code = "rate_limited"`.',
        '',
        '## Errors',
        '',
        'Every error uses `{ "error": { "code", "message", "details?" } }`. Codes:',
        '`validation_error`, `unauthorized`, `forbidden`, `not_found`, `conflict`, `rate_limited`,',
        '`internal_error`.',
        '',
        '## Real-time events (WebSocket)',
        '',
        'Connect to `/api/ws`. **An API key is required — a user access token is rejected.**',
        'Send the key as a subprotocol so it never lands in a URL or an access log, alongside',
        'the `ping-monitor-v1` sentinel:',
        '',
        '```js',
        'const ws = new WebSocket("wss://your-host/api/ws", ["ping-monitor-v1", "pk_your_key"]);',
        '```',
        '',
        'The server negotiates `ping-monitor-v1` and **never echoes the key back** — offering the',
        'key alone still works, but then no subprotocol is negotiated at all.',
        '',
        'The `?apiKey=` query parameter also works but is discouraged: it puts the credential in',
        'a URL, where proxies and browser history keep it.',
        '',
        'Frames are JSON and always carry a `type`:',
        '',
        '- `{"type":"connected","workspaceId":"…"}` — sent once, on success.',
        '- `{"type":"error","message":"…"}` — authentication failed or the connection cap was',
        '  reached; the socket closes immediately afterwards.',
        '- `{"type":"monitor.status_changed", "monitorId", "workspaceId", "monitorName", "from",',
        '  "to", "at", "responseMs", "error"?}` — the only event type today. `from` and `to` are',
        '  `pending`, `up`, `down` or `paused`, so the first frame for a new monitor is usually',
        '  `pending → up`.',
        '',
        'You only ever receive events for the key’s own workspace. The server sends WebSocket',
        'pings every 30s and drops unresponsive sockets, and allows 50 concurrent connections per',
        'workspace per API process. An open socket re-checks its key every minute, so revoking a',
        'key also drops the connections using it.',
      ].join('\n'),
    },
    servers: [{ url: '/api', description: 'This instance' }],
    tags: [
      { name: 'Authentication' },
      { name: 'Workspaces' },
      { name: 'Dashboard' },
      { name: 'Monitors' },
      { name: 'Notification channels' },
      { name: 'Groups' },
      { name: 'Tags' },
      { name: 'Status pages' },
      { name: 'API keys' },
      { name: 'Service' },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'A workspace API key: `Authorization: Bearer pk_…`',
        },
        userToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'A user access token from `POST /auth/login`.',
        },
      },
      schemas,
    },
    security: anyAuth,
    paths,
  };
  return document as unknown as OpenAPIV3.Document;
}

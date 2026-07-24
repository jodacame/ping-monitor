import { z } from 'zod';
import { CHECK_INTERVALS_SECONDS, MAX_RETRY_THRESHOLD } from '@ping/core';

/** Request validation schemas. One source of truth for every endpoint's input. */

export const registerSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8, 'Password must be at least 8 characters').max(200),
  name: z.string().trim().min(1).max(120).optional(),
});

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const monitorType = z.enum(['http', 'tcp', 'icmp']);
const interval = z
  .number()
  .int()
  .refine((v) => (CHECK_INTERVALS_SECONDS as readonly number[]).includes(v), {
    message: `Interval must be one of: ${CHECK_INTERVALS_SECONDS.join(', ')} seconds`,
  });
const threshold = z.number().int().min(1).max(MAX_RETRY_THRESHOLD);

export const createMonitorSchema = z.object({
  name: z.string().trim().min(1).max(120),
  type: monitorType,
  target: z.string().trim().min(1).max(2048),
  config: z.record(z.unknown()).default({}),
  intervalSeconds: interval,
  timeoutMs: z.number().int().min(1000).max(60_000).default(10_000),
  failureThreshold: threshold.default(3),
  recoveryThreshold: threshold.default(1),
  quorum: z.number().int().min(1).max(50).default(1),
  regionIds: z.array(z.number().int().positive()).max(50).default([]),
  groupId: z.string().nullish(),
  tagIds: z.array(z.string()).max(50).optional(),
});

export const updateMonitorSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    target: z.string().trim().min(1).max(2048),
    config: z.record(z.unknown()),
    intervalSeconds: interval,
    timeoutMs: z.number().int().min(1000).max(60_000),
    failureThreshold: threshold,
    recoveryThreshold: threshold,
    quorum: z.number().int().min(1).max(50),
    regionIds: z.array(z.number().int().positive()).max(50),
    groupId: z.string().nullable(),
    tagIds: z.array(z.string()).max(50),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

// --- Tags --------------------------------------------------------------------

export const createTagSchema = z.object({
  name: z.string().trim().min(1).max(40),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex code')
    .optional(),
});

// --- Monitor groups ----------------------------------------------------------

export const createGroupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  sortOrder: z.number().int().optional(),
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    sortOrder: z.number().int(),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

// --- Status pages ------------------------------------------------------------

export const createStatusPageSchema = z.object({
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(80).optional(),
  description: z.string().trim().max(500).optional(),
  monitorIds: z.array(z.string()).max(200).optional(),
});

export const updateStatusPageSchema = z
  .object({
    title: z.string().trim().min(1).max(120),
    slug: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).nullable(),
    monitorIds: z.array(z.string()).max(200),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

export const listMonitorsQuerySchema = z.object({
  status: z.enum(['up', 'down', 'paused', 'pending']).optional(),
  tagId: z.string().optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const statsQuerySchema = z.object({
  window: z.enum(['24h', '7d', '30d']).default('24h'),
});

export const recentChecksQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// --- Notification channels ---------------------------------------------------

export const createChannelSchema = z.object({
  type: z.enum(['smtp', 'telegram', 'webhook']),
  name: z.string().trim().min(1).max(120),
  // Connector-specific; deeply validated by the notifications package.
  config: z.record(z.unknown()),
  enabled: z.boolean().optional(),
});

export const updateChannelSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    config: z.record(z.unknown()),
    enabled: z.boolean(),
  })
  .partial()
  .refine((obj) => Object.keys(obj).length > 0, { message: 'No fields to update' });

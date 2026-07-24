import type { MonitorStatus, MonitorType } from '@ping/core';
import type { WorkspaceRole } from '../codecs.js';

/**
 * Decoded domain records returned by repositories.
 *
 * Internal `id`s are BIGINT and surfaced as strings (node-postgres returns int8
 * as string to avoid precision loss); callers pass them straight back into
 * queries. External code should prefer `publicId` (ULID).
 */

export interface UserRecord {
  readonly id: string;
  readonly publicId: string;
  readonly email: string;
  readonly name: string | null;
  readonly createdAt: Date;
}

export interface UserWithSecret extends UserRecord {
  readonly passwordHash: string;
}

export interface WorkspaceRecord {
  readonly id: string;
  readonly publicId: string;
  readonly name: string;
  readonly slug: string;
  readonly createdAt: Date;
}

export interface WorkspaceMembership extends WorkspaceRecord {
  readonly role: WorkspaceRole;
}

export interface RegionRecord {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly enabled: boolean;
}

export interface MonitorRecord {
  readonly id: string;
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly type: MonitorType;
  readonly target: string;
  readonly config: Record<string, unknown>;
  readonly intervalSeconds: number;
  readonly timeoutMs: number;
  readonly failureThreshold: number;
  readonly recoveryThreshold: number;
  readonly quorum: number;
  readonly enabled: boolean;
  readonly status: MonitorStatus;
  readonly lastCheckedAt: Date | null;
  readonly lastStatusChangedAt: Date | null;
  readonly lastResponseMs: number | null;
  /** Public id of the group this monitor belongs to, or null. */
  readonly groupId: string | null;
  readonly groupName: string | null;
  readonly tags: TagRecord[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface TagRecord {
  readonly id: string;
  readonly name: string;
  readonly color: string;
}

export interface MonitorGroupRecord {
  readonly id: string;
  readonly publicId: string;
  readonly workspaceId: string;
  readonly name: string;
  readonly sortOrder: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface IncidentRecord {
  readonly id: string;
  readonly publicId: string;
  readonly monitorId: string;
  readonly startedAt: Date;
  readonly resolvedAt: Date | null;
  readonly durationSeconds: number | null;
  readonly causeMessage: string | null;
}

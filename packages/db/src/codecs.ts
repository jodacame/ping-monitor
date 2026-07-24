import { CheckErrorKind, MonitorStatus, MonitorType } from '@ping/core';

/**
 * Compact SMALLINT codecs.
 *
 * Enums are stored as small integers on disk for density (a monitor's status is
 * one byte, not a string) but manipulated as readable string enums in code.
 * Each codec is a bijection with an exhaustive reverse lookup; unknown integers
 * from the database fall back to a safe default rather than throwing, so a
 * forward-compatible reader never crashes on a value it doesn't recognise.
 */

function reverse<T extends string>(map: Record<T, number>): Map<number, T> {
  return new Map((Object.entries(map) as [T, number][]).map(([k, v]) => [v, k]));
}

// --- Monitor type ------------------------------------------------------------

const MONITOR_TYPE_TO_CODE: Record<MonitorType, number> = {
  [MonitorType.Http]: 0,
  [MonitorType.Tcp]: 1,
  [MonitorType.Icmp]: 2,
};
const MONITOR_TYPE_FROM_CODE = reverse(MONITOR_TYPE_TO_CODE);

export function encodeMonitorType(type: MonitorType): number {
  return MONITOR_TYPE_TO_CODE[type];
}
export function decodeMonitorType(code: number): MonitorType {
  return MONITOR_TYPE_FROM_CODE.get(code) ?? MonitorType.Http;
}

// --- Monitor status ----------------------------------------------------------

const MONITOR_STATUS_TO_CODE: Record<MonitorStatus, number> = {
  [MonitorStatus.Down]: 0,
  [MonitorStatus.Up]: 1,
  [MonitorStatus.Paused]: 2,
  [MonitorStatus.Pending]: 3,
};
const MONITOR_STATUS_FROM_CODE = reverse(MONITOR_STATUS_TO_CODE);

export function encodeMonitorStatus(status: MonitorStatus): number {
  return MONITOR_STATUS_TO_CODE[status];
}
export function decodeMonitorStatus(code: number): MonitorStatus {
  return MONITOR_STATUS_FROM_CODE.get(code) ?? MonitorStatus.Pending;
}

// --- Check error kind --------------------------------------------------------

const ERROR_KIND_TO_CODE: Record<CheckErrorKind, number> = {
  [CheckErrorKind.Timeout]: 0,
  [CheckErrorKind.Dns]: 1,
  [CheckErrorKind.Connection]: 2,
  [CheckErrorKind.Tls]: 3,
  [CheckErrorKind.HttpStatus]: 4,
  [CheckErrorKind.Protocol]: 5,
  [CheckErrorKind.Unknown]: 6,
};
const ERROR_KIND_FROM_CODE = reverse(ERROR_KIND_TO_CODE);

export function encodeErrorKind(kind: CheckErrorKind): number {
  return ERROR_KIND_TO_CODE[kind];
}
export function decodeErrorKind(code: number | null): CheckErrorKind | null {
  if (code === null) return null;
  return ERROR_KIND_FROM_CODE.get(code) ?? CheckErrorKind.Unknown;
}

// --- Workspace member role ---------------------------------------------------

export const WorkspaceRole = {
  Owner: 'owner',
  Admin: 'admin',
  Member: 'member',
  Viewer: 'viewer',
} as const;
export type WorkspaceRole = (typeof WorkspaceRole)[keyof typeof WorkspaceRole];

const ROLE_TO_CODE: Record<WorkspaceRole, number> = {
  [WorkspaceRole.Owner]: 0,
  [WorkspaceRole.Admin]: 1,
  [WorkspaceRole.Member]: 2,
  [WorkspaceRole.Viewer]: 3,
};
const ROLE_FROM_CODE = reverse(ROLE_TO_CODE);

export function encodeRole(role: WorkspaceRole): number {
  return ROLE_TO_CODE[role];
}
export function decodeRole(code: number): WorkspaceRole {
  return ROLE_FROM_CODE.get(code) ?? WorkspaceRole.Viewer;
}

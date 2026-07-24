/** API DTOs shared across the SPA (mirror the server's public shapes). */

export type MonitorStatus = 'up' | 'down' | 'paused' | 'pending';
export type MonitorType = 'http' | 'tcp' | 'icmp';
export type StatsWindow = '24h' | '7d' | '30d';

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
}

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Workspace {
  id: string;
  name: string;
  slug: string;
  role: 'owner' | 'admin' | 'member' | 'viewer';
}

export interface Region {
  id: number;
  code: string;
  name: string;
  enabled: boolean;
}

export interface Monitor {
  id: string;
  name: string;
  type: MonitorType;
  target: string;
  config: Record<string, unknown>;
  intervalSeconds: number;
  timeoutMs: number;
  failureThreshold: number;
  recoveryThreshold: number;
  quorum: number;
  enabled: boolean;
  status: MonitorStatus;
  lastCheckedAt: string | null;
  lastStatusChangedAt: string | null;
  lastResponseMs: number | null;
  createdAt: string;
  updatedAt: string;
  regionIds?: number[];
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

export interface Overview {
  total: number;
  up: number;
  down: number;
  paused: number;
  pending: number;
}

export interface MonitorSummary {
  checksTotal: number;
  checksUp: number;
  uptime: number | null;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
}

export interface SeriesPoint {
  bucket: string;
  checksTotal: number;
  checksUp: number;
  uptime: number | null;
  avgLatencyMs: number | null;
  minLatencyMs: number | null;
  maxLatencyMs: number | null;
}

export interface MonitorStatsResponse {
  window: StatsWindow;
  summary: MonitorSummary;
  series: SeriesPoint[];
}

export interface RecentCheck {
  regionId: number;
  checkedAt: string;
  up: boolean;
  responseMs: number | null;
  statusCode: number | null;
  errorKind: string | null;
}

export interface Incident {
  publicId: string;
  startedAt: string;
  resolvedAt: string | null;
  durationSeconds: number | null;
  causeMessage: string | null;
}

export interface CreateMonitorInput {
  name: string;
  type: MonitorType;
  target: string;
  intervalSeconds: number;
  timeoutMs?: number;
  failureThreshold?: number;
  recoveryThreshold?: number;
  quorum?: number;
  regionIds?: number[];
  config?: Record<string, unknown>;
}

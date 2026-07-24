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
  groupId?: string | null;
  groupName?: string | null;
  /** 24h uptime ratio [0,1] (list view enrichment). */
  uptime24h?: number | null;
  /** Recent hourly up-ratios, oldest→newest (null = no data). */
  bars?: Array<number | null>;
}

export interface MonitorGroup {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceInsights {
  uptime: number | null;
  avgLatencyMs: number | null;
  incidents24h: number;
}

export type ConnectorType = 'smtp' | 'telegram' | 'webhook';

export interface Channel {
  id: string;
  type: ConnectorType;
  name: string;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateChannelInput {
  type: ConnectorType;
  name: string;
  config: Record<string, unknown>;
  enabled?: boolean;
}

export interface StatusPageSummary {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  updatedAt: string;
}

export interface StatusPageDetail extends StatusPageSummary {
  monitorIds: string[];
}

export interface CreateStatusPageInput {
  title: string;
  slug?: string;
  description?: string;
  monitorIds?: string[];
}

export interface PublicStatusMonitor {
  name: string;
  status: MonitorStatus;
  uptime24h: number | null;
  bars: Array<number | null>;
}

export interface PublicStatusPage {
  title: string;
  description: string | null;
  updatedAt: string;
  monitors: PublicStatusMonitor[];
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
  groupId?: string | null;
}

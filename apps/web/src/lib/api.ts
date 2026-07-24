import type {
  AuthResult,
  AuthUser,
  Channel,
  CreateChannelInput,
  CreateMonitorInput,
  Incident,
  Monitor,
  MonitorStatsResponse,
  Overview,
  Paginated,
  RecentCheck,
  Region,
  StatsWindow,
  Workspace,
  WorkspaceInsights,
} from './types';

/**
 * Typed API client.
 *
 * Talks to a same-origin `/api`. Access/refresh tokens are persisted in
 * localStorage; a 401 triggers a single transparent refresh-and-retry, with
 * concurrent requests sharing one in-flight refresh.
 */

const BASE = '/api';
const TOKENS_KEY = 'pm.tokens';

interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function readTokens(): StoredTokens | null {
  try {
    const raw = localStorage.getItem(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as StoredTokens) : null;
  } catch {
    return null;
  }
}

export function storeTokens(tokens: StoredTokens): void {
  localStorage.setItem(TOKENS_KEY, JSON.stringify(tokens));
}

export function clearTokens(): void {
  localStorage.removeItem(TOKENS_KEY);
}

export function isAuthenticated(): boolean {
  return readTokens() !== null;
}

let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const tokens = readTokens();
  if (!tokens) return null;

  refreshInFlight ??= (async () => {
    try {
      const res = await fetch(`${BASE}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      });
      if (!res.ok) {
        clearTokens();
        return null;
      }
      const data = (await res.json()) as AuthResult;
      storeTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
      return data.accessToken;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;

  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (auth && token) headers['authorization'] = `Bearer ${token}`;
    return fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  };

  let token = auth ? (readTokens()?.accessToken ?? null) : null;
  let res = await send(token);

  if (res.status === 401 && auth) {
    token = await refreshAccessToken();
    if (token) res = await send(token);
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; details?: unknown } })?.error;
    throw new ApiError(err?.message ?? res.statusText, res.status, err?.code, err?.details);
  }
  return data as T;
}

// --- Auth --------------------------------------------------------------------

export const api = {
  async register(input: { email: string; password: string; name?: string }): Promise<AuthResult> {
    const result = await request<AuthResult>('/auth/register', {
      method: 'POST',
      body: input,
      auth: false,
    });
    storeTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    return result;
  },

  async login(input: { email: string; password: string }): Promise<AuthResult> {
    const result = await request<AuthResult>('/auth/login', {
      method: 'POST',
      body: input,
      auth: false,
    });
    storeTokens({ accessToken: result.accessToken, refreshToken: result.refreshToken });
    return result;
  },

  async logout(): Promise<void> {
    const tokens = readTokens();
    if (tokens) {
      await request('/auth/logout', {
        method: 'POST',
        body: { refreshToken: tokens.refreshToken },
      }).catch(() => undefined);
    }
    clearTokens();
  },

  me(): Promise<{ user: AuthUser; workspaces: Workspace[] }> {
    return request('/auth/me');
  },

  // --- Resources -------------------------------------------------------------

  listWorkspaces(): Promise<Workspace[]> {
    return request('/workspaces');
  },

  listRegions(): Promise<Region[]> {
    return request('/regions');
  },

  overview(workspaceId: string): Promise<Overview> {
    return request(`/workspaces/${workspaceId}/overview`);
  },

  insights(workspaceId: string): Promise<WorkspaceInsights> {
    return request(`/workspaces/${workspaceId}/insights`);
  },

  // --- Notification channels -------------------------------------------------

  listChannels(workspaceId: string): Promise<Channel[]> {
    return request(`/workspaces/${workspaceId}/channels`);
  },

  createChannel(workspaceId: string, input: CreateChannelInput): Promise<Channel> {
    return request(`/workspaces/${workspaceId}/channels`, { method: 'POST', body: input });
  },

  updateChannel(
    workspaceId: string,
    id: string,
    input: Partial<CreateChannelInput>,
  ): Promise<Channel> {
    return request(`/workspaces/${workspaceId}/channels/${id}`, { method: 'PATCH', body: input });
  },

  deleteChannel(workspaceId: string, id: string): Promise<void> {
    return request(`/workspaces/${workspaceId}/channels/${id}`, { method: 'DELETE' });
  },

  testChannel(workspaceId: string, id: string): Promise<{ ok: boolean; error?: string }> {
    return request(`/workspaces/${workspaceId}/channels/${id}/test`, { method: 'POST' });
  },

  listMonitors(
    workspaceId: string,
    params: { search?: string; status?: string; page?: number; pageSize?: number } = {},
  ): Promise<Paginated<Monitor>> {
    const q = new URLSearchParams();
    if (params.search) q.set('search', params.search);
    if (params.status) q.set('status', params.status);
    if (params.page) q.set('page', String(params.page));
    if (params.pageSize) q.set('pageSize', String(params.pageSize));
    const qs = q.toString();
    return request(`/workspaces/${workspaceId}/monitors${qs ? `?${qs}` : ''}`);
  },

  getMonitor(workspaceId: string, id: string): Promise<Monitor> {
    return request(`/workspaces/${workspaceId}/monitors/${id}`);
  },

  createMonitor(workspaceId: string, input: CreateMonitorInput): Promise<Monitor> {
    return request(`/workspaces/${workspaceId}/monitors`, { method: 'POST', body: input });
  },

  updateMonitor(
    workspaceId: string,
    id: string,
    input: Partial<CreateMonitorInput>,
  ): Promise<Monitor> {
    return request(`/workspaces/${workspaceId}/monitors/${id}`, { method: 'PATCH', body: input });
  },

  deleteMonitor(workspaceId: string, id: string): Promise<void> {
    return request(`/workspaces/${workspaceId}/monitors/${id}`, { method: 'DELETE' });
  },

  pauseMonitor(workspaceId: string, id: string): Promise<void> {
    return request(`/workspaces/${workspaceId}/monitors/${id}/pause`, { method: 'POST' });
  },

  resumeMonitor(workspaceId: string, id: string): Promise<void> {
    return request(`/workspaces/${workspaceId}/monitors/${id}/resume`, { method: 'POST' });
  },

  monitorStats(workspaceId: string, id: string, window: StatsWindow): Promise<MonitorStatsResponse> {
    return request(`/workspaces/${workspaceId}/monitors/${id}/stats?window=${window}`);
  },

  monitorChecks(workspaceId: string, id: string, limit = 50): Promise<RecentCheck[]> {
    return request(`/workspaces/${workspaceId}/monitors/${id}/checks?limit=${limit}`);
  },

  monitorIncidents(workspaceId: string, id: string, limit = 20): Promise<Incident[]> {
    return request(`/workspaces/${workspaceId}/monitors/${id}/incidents?limit=${limit}`);
  },
};

/**
 * Shared plumbing for the integration suites. See README.md in this directory.
 */

export const BASE = process.env.PING_E2E_BASE ?? '';
export const EMAIL = process.env.PING_E2E_EMAIL ?? 'demo@example.com';
export const PASSWORD = process.env.PING_E2E_PASSWORD ?? 'supersecret';

/** These suites only run when an instance is provided. */
export const live = BASE !== '';

export interface Response<T = unknown> {
  status: number;
  json: T;
  headers: Headers;
}

export async function call<T = unknown>(
  path: string,
  options: {
    method?: string;
    token?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {},
): Promise<Response<T>> {
  const res = await fetch(`${BASE}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
    ...(options.body ? { body: JSON.stringify(options.body) } : {}),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json: json as T, headers: res.headers };
}

/** Sign in and return an access token. */
export async function login(): Promise<string> {
  const res = await call<{ accessToken: string }>('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASSWORD },
  });
  if (res.status !== 200) {
    throw new Error(
      `Cannot sign in as ${EMAIL} (HTTP ${res.status}). Seed the instance or set PING_E2E_EMAIL/PASSWORD.`,
    );
  }
  return res.json.accessToken;
}

export async function firstWorkspaceId(token: string): Promise<string> {
  const res = await call<Array<{ id: string }>>('/workspaces', { token });
  const id = res.json[0]?.id;
  if (!id) throw new Error('The account has no workspace.');
  return id;
}

export async function createKey(
  token: string,
  workspaceId: string,
  body: Record<string, unknown>,
): Promise<{ id: string; key: string }> {
  const res = await call<{ id: string; key: string }>(`/workspaces/${workspaceId}/api-keys`, {
    method: 'POST',
    token,
    body,
  });
  if (res.status !== 201) throw new Error(`Could not create an API key (HTTP ${res.status}).`);
  return res.json;
}

/** Connect to the event stream and resolve with the first frame received. */
export function firstWsFrame(
  path: string,
  protocols?: string[],
): Promise<{ type: string; [k: string]: unknown }> {
  const url = `${BASE.replace(/^http/, 'ws')}${path}`;
  return new Promise((resolve) => {
    let socket: WebSocket;
    try {
      socket = protocols ? new WebSocket(url, protocols) : new WebSocket(url);
    } catch {
      resolve({ type: 'throw' });
      return;
    }
    const timer = setTimeout(() => {
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve({ type: 'timeout' });
    }, 5000);
    const done = (frame: { type: string; [k: string]: unknown }): void => {
      clearTimeout(timer);
      try {
        socket.close();
      } catch {
        /* ignore */
      }
      resolve(frame);
    };
    socket.onmessage = (event) => {
      try {
        done(JSON.parse(String(event.data)) as { type: string });
      } catch {
        done({ type: 'unparsable' });
      }
    };
    socket.onerror = () => done({ type: 'socket-error' });
    socket.onclose = () => done({ type: 'closed-without-frame' });
  });
}

/** A unique-ish suffix so repeated runs do not collide on names. */
export const runId = String(process.hrtime.bigint()).slice(-8);

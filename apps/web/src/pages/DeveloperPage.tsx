import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Check, Copy, Key, Plus, Trash2 } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import { formatRelativeTime } from '../lib/format';
import type { ApiKey } from '../lib/types';
import { AppShell } from '../components/AppShell';
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
} from '../components/ui';

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Copies text to the clipboard, reporting whether it worked.
 *
 * The async Clipboard API is unavailable in non-secure contexts (a self-hosted
 * deployment served over plain HTTP), so we fall back to the legacy command
 * before giving up and asking the user to copy manually.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Blocked by permissions or a non-secure context — try the legacy path.
  }
  try {
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.appendChild(scratch);
    scratch.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(scratch);
    return ok;
  } catch {
    return false;
  }
}

function CopyButton({ text }: { text: string }) {
  const [state, setState] = useState<CopyState>('idle');

  const onCopy = async (): Promise<void> => {
    const ok = await copyText(text);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), ok ? 1500 : 6000);
  };

  return (
    <button
      onClick={() => void onCopy()}
      title={
        state === 'failed'
          ? 'Your browser blocked the clipboard (this usually needs HTTPS). Select the text and copy it manually.'
          : undefined
      }
      className={cn(
        'inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition-colors',
        state === 'failed'
          ? 'border-down/20 bg-down/10 text-down'
          : 'border-border bg-bg text-muted hover:text-fg',
      )}
    >
      {state === 'copied' ? (
        <Check size={13} className="text-up" />
      ) : state === 'failed' ? (
        <AlertTriangle size={13} />
      ) : (
        <Copy size={13} />
      )}
      {state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : 'Copy'}
    </button>
  );
}

/**
 * Code sample with its own copy button.
 *
 * The button sits in a bar above the code instead of floating over it: an
 * overlay hides the end of a long single line on narrow screens, and padding
 * cannot fix that reliably because the button stays put while the code scrolls
 * underneath it.
 */
function CodeBlock({ children }: { children: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg">
      <div className="flex justify-end border-b border-border px-2 py-1.5">
        <CopyButton text={children} />
      </div>
      <pre className="overflow-x-auto p-3 text-xs leading-relaxed text-fg">
        <code className="select-all">{children}</code>
      </pre>
    </div>
  );
}

/** A key past its expiry date is still listed but rejects every request. */
function isExpired(key: ApiKey): boolean {
  return key.expiresAt !== null && new Date(key.expiresAt).getTime() <= Date.now();
}

export function DeveloperPage() {
  const { currentWorkspace } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id ?? '';
  const [name, setName] = useState('');
  const [readOnly, setReadOnly] = useState(false);
  const [expiry, setExpiry] = useState('');
  const [ips, setIps] = useState('');
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  const origin = window.location.origin;
  // No credential in the URL: the key goes in the subprotocol (see the snippet).
  const wsUrl = `${origin.replace(/^http/, 'ws')}/api/ws`;

  const keys = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => api.listApiKeys(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const create = useMutation({
    mutationFn: () => {
      const allowedIps = ips
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      return api.createApiKey(workspaceId, {
        name: name.trim(),
        scopes: readOnly ? ['read'] : ['read', 'write'],
        ...(expiry ? { expiresInDays: Number(expiry) } : {}),
        ...(allowedIps.length ? { allowedIps } : {}),
      });
    },
    onSuccess: async (created) => {
      setCreateError(null);
      setFreshKey(created.key);
      setName('');
      setReadOnly(false);
      setExpiry('');
      setIps('');
      await queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
    onError: (err) =>
      setCreateError(err instanceof ApiError ? err.message : 'Could not create the API key.'),
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(workspaceId, id),
    onError: (err) =>
      setRevokeError(err instanceof ApiError ? err.message : 'Could not revoke this key.'),
    // Runs on success and on failure, so the dialog can never stay stuck open.
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
      setToRevoke(null);
    },
  });

  return (
    <AppShell title="Developers">
      <div className="mx-auto max-w-3xl space-y-8 p-4 sm:p-6">
        {/* API keys */}
        <section className="space-y-4">
          <div>
            <h2 className="text-sm font-semibold text-fg">API keys</h2>
            <p className="text-sm text-muted">
              Authenticate REST and WebSocket requests. Keys are scoped to this workspace.
            </p>
          </div>

          {freshKey && (
            <Card className="space-y-2 border-primary/30 bg-primary/5 p-4">
              <div className="text-sm font-medium text-fg">
                Copy your key now — you won’t be able to see it again.
              </div>
              <CodeBlock>{freshKey}</CodeBlock>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setFreshKey(null);
                  // Drops the plaintext key from the mutation cache as well.
                  create.reset();
                }}
              >
                Done
              </Button>
            </Card>
          )}

          <Card className="space-y-4 p-4">
            {createError && (
              <div className="rounded-lg border border-down/20 bg-down/10 px-3 py-2 text-sm text-down">
                {createError}
              </div>
            )}
            <Field label="New key name" hint="Up to 60 characters.">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="CI pipeline"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Access">
                <SegmentedControl
                  options={[
                    { value: 'rw', label: 'Read & write' },
                    { value: 'ro', label: 'Read only' },
                  ]}
                  value={readOnly ? 'ro' : 'rw'}
                  onChange={(v) => setReadOnly(v === 'ro')}
                />
              </Field>
              <Field label="Expires">
                <Select value={expiry} onChange={(e) => setExpiry(e.target.value)}>
                  <option value="">Never</option>
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="365">1 year</option>
                </Select>
              </Field>
              <Field
                label="Allowed IPs"
                hint="Optional. Comma-separated IPv4/IPv6 addresses or CIDR blocks. Needs TRUST_PROXY to match your proxy setup."
              >
                <Input
                  value={ips}
                  onChange={(e) => setIps(e.target.value)}
                  placeholder="203.0.113.4, 10.0.0.0/8, 2001:db8::/32"
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button
                leadingIcon={<Plus size={16} />}
                onClick={() => {
                  setCreateError(null);
                  create.mutate();
                }}
                loading={create.isPending}
                disabled={!name.trim()}
              >
                Create key
              </Button>
            </div>
          </Card>

          {revokeError && (
            <div className="rounded-lg border border-down/20 bg-down/10 px-3 py-2 text-sm text-down">
              {revokeError}
            </div>
          )}

          {keys.isLoading ? (
            <div className="grid place-items-center py-10 text-muted">
              <Spinner size={20} />
            </div>
          ) : keys.isError ? (
            <div className="space-y-3 rounded-lg border border-down/20 bg-down/10 px-3 py-3 text-sm text-down">
              <p>
                {keys.error instanceof ApiError
                  ? keys.error.message
                  : 'Could not load your API keys.'}{' '}
                Your existing keys are still active — try again before creating a new one.
              </p>
              <Button size="sm" variant="secondary" onClick={() => void keys.refetch()}>
                Try again
              </Button>
            </div>
          ) : keys.data && keys.data.length > 0 ? (
            <div className="space-y-2">
              {keys.data.map((k) => (
                <Card key={k.id} className="flex items-center gap-3 p-4">
                  <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-elevated text-muted">
                    <Key size={16} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-fg">{k.name}</div>
                    <div className="text-xs text-muted">
                      <code>{k.prefix}</code> · created {formatRelativeTime(k.createdAt)} · last used{' '}
                      {formatRelativeTime(k.lastUsedAt)}
                    </div>
                  </div>
                  <div className="hidden items-center gap-1.5 sm:flex">
                    <Badge tone={k.scopes.includes('write') ? 'primary' : 'neutral'}>
                      {k.scopes.includes('write') ? 'Read & write' : 'Read only'}
                    </Badge>
                    {k.expiresAt &&
                      (isExpired(k) ? (
                        <Badge tone="down">
                          Expired {new Date(k.expiresAt).toLocaleDateString()}
                        </Badge>
                      ) : (
                        <Badge tone="warn">
                          Expires {new Date(k.expiresAt).toLocaleDateString()}
                        </Badge>
                      ))}
                    {k.allowedIps && k.allowedIps.length > 0 && (
                      <span
                        className="inline-flex"
                        title={`Only accepted from: ${k.allowedIps.join(', ')}`}
                      >
                        <Badge tone="neutral">
                          IP-locked:{' '}
                          {k.allowedIps.length === 1
                            ? k.allowedIps.join('')
                            : `${k.allowedIps.length} entries`}
                        </Badge>
                      </span>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setRevokeError(null);
                      setToRevoke(k);
                    }}
                    aria-label="Revoke key"
                  >
                    <Trash2 size={15} />
                  </Button>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Key size={22} />}
              title="No API keys yet"
              description="Create a key to integrate your apps with the REST API and real-time events."
            />
          )}
        </section>

        {/* REST docs */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg">Using the REST API</h2>
          <p className="text-sm text-muted">
            Send your key as a bearer token. The base URL is{' '}
            <code className="text-fg">{origin}/api</code>.
          </p>
          {/* Every REST path carries the workspace id, so it gets its own copy button. */}
          <div className="flex items-center gap-3 rounded-lg border border-border bg-bg px-3 py-2">
            <span className="shrink-0 text-xs font-medium text-muted">Workspace ID</span>
            {workspaceId ? (
              <>
                <code className="min-w-0 flex-1 select-all break-all text-xs text-fg">
                  {workspaceId}
                </code>
                <div className="shrink-0">
                  <CopyButton text={workspaceId} />
                </div>
              </>
            ) : (
              <span className="text-xs text-muted">
                Available once you open a workspace. The samples below use a placeholder instead.
              </span>
            )}
          </div>
          <CodeBlock>{`curl ${origin}/api/workspaces/${workspaceId || 'WORKSPACE_ID'}/monitors \\
  -H "Authorization: Bearer YOUR_KEY"`}</CodeBlock>
          <p className="text-xs text-muted">
            A key reaches every endpoint of this workspace and acts as an admin here, so a
            read-and-write key can delete things. Read-only keys get a 403 on anything other than
            GET. Managing keys themselves needs a signed-in user, not a key.
          </p>
          <p className="text-xs text-muted">
            Full reference, with every endpoint and field:{' '}
            <a
              className="text-fg underline underline-offset-2 hover:no-underline"
              href={`${origin}/api/docs`}
              target="_blank"
              rel="noreferrer"
            >
              {origin}/api/docs
            </a>
          </p>
        </section>

        {/* WebSocket docs */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg">Real-time events (WebSocket)</h2>
          <p className="text-sm text-muted">
            Get status changes the instant they happen — no polling. This needs an API key; a
            signed-in user session is not accepted here. Send the key as the WebSocket subprotocol so
            it never lands in a URL or a server log.
          </p>
          <CodeBlock>{`const ws = new WebSocket("${wsUrl}", ["YOUR_KEY"]);

ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "connected":
      // { type, workspaceId } — sent once, on success
      break;
    case "monitor.status_changed":
      // { type, monitorId, workspaceId, monitorName, from, to, at, responseMs, error? }
      // from/to are: pending | up | down | paused
      console.log(msg.monitorName, msg.from, "->", msg.to);
      break;
    case "error":
      // key rejected or too many connections; the socket closes next
      console.error(msg.message);
      break;
  }
};`}</CodeBlock>
          <p className="text-xs text-muted">
            Match on <code className="text-fg">monitorId</code>, not the name, which can change. You
            only receive events for this workspace. Up to 50 connections per workspace; the server
            pings every 30s and drops silent sockets, so reconnect with backoff. Revoking a key stops
            new connections but does not close one that is already open.
          </p>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(toRevoke)}
        onClose={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        title="Revoke API key?"
        message={
          <>
            <p>
              <strong className="text-fg">{toRevoke?.name}</strong> stops working right away, and
              anything using it will start failing. This cannot be undone.
            </p>
            <p className="mt-2">
              To replace a key, create the new one first, update your apps, then revoke this one.
            </p>
          </>
        }
        confirmLabel="Revoke"
        danger
        loading={revoke.isPending}
      />
    </AppShell>
  );
}

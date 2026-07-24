import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Key, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatRelativeTime } from '../lib/format';
import type { ApiKey } from '../lib/types';
import { AppShell } from '../components/AppShell';
import {
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  Input,
  Spinner,
} from '../components/ui';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs text-muted transition-colors hover:text-fg"
    >
      {copied ? <Check size={13} className="text-up" /> : <Copy size={13} />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <div className="relative">
      <pre className="overflow-x-auto rounded-lg border border-border bg-bg p-3 text-xs leading-relaxed text-fg">
        <code>{children}</code>
      </pre>
      <div className="absolute right-2 top-2">
        <CopyButton text={children} />
      </div>
    </div>
  );
}

export function DeveloperPage() {
  const { currentWorkspace } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id ?? '';
  const [name, setName] = useState('');
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [toRevoke, setToRevoke] = useState<ApiKey | null>(null);

  const origin = window.location.origin;
  const wsUrl = `${origin.replace(/^http/, 'ws')}/api/ws?apiKey=YOUR_KEY`;

  const keys = useQuery({
    queryKey: ['api-keys', workspaceId],
    queryFn: () => api.listApiKeys(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const create = useMutation({
    mutationFn: () => api.createApiKey(workspaceId, name.trim()),
    onSuccess: async (created) => {
      setFreshKey(created.key);
      setName('');
      await queryClient.invalidateQueries({ queryKey: ['api-keys', workspaceId] });
    },
  });

  const revoke = useMutation({
    mutationFn: (id: string) => api.revokeApiKey(workspaceId, id),
    onSuccess: async () => {
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
              <Button size="sm" variant="secondary" onClick={() => setFreshKey(null)}>
                Done
              </Button>
            </Card>
          )}

          <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Field label="New key name">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="CI pipeline"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && name.trim()) create.mutate();
                  }}
                />
              </Field>
            </div>
            <Button
              leadingIcon={<Plus size={16} />}
              onClick={() => create.mutate()}
              loading={create.isPending}
              disabled={!name.trim()}
            >
              Create key
            </Button>
          </Card>

          {keys.isLoading ? (
            <div className="grid place-items-center py-10 text-muted">
              <Spinner size={20} />
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
                      <code>{k.prefix}</code> · last used {formatRelativeTime(k.lastUsedAt)}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setToRevoke(k)}
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
          <CodeBlock>{`curl ${origin}/api/workspaces/${workspaceId || 'WORKSPACE_ID'}/monitors \\
  -H "Authorization: Bearer YOUR_KEY"`}</CodeBlock>
          <p className="text-xs text-muted">
            Every workspace-scoped endpoint accepts an API key. Managing keys themselves requires a
            signed-in user.
          </p>
        </section>

        {/* WebSocket docs */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-fg">Real-time events (WebSocket)</h2>
          <p className="text-sm text-muted">
            Connect to receive <code className="text-fg">monitor.status_changed</code> events the
            instant a monitor goes up or down — no polling.
          </p>
          <CodeBlock>{`const ws = new WebSocket("${wsUrl}");
ws.onmessage = (e) => {
  const event = JSON.parse(e.data);
  // { type: "monitor.status_changed", monitorName, from, to, at, responseMs }
  console.log(event);
};`}</CodeBlock>
        </section>
      </div>

      <ConfirmDialog
        open={Boolean(toRevoke)}
        onClose={() => setToRevoke(null)}
        onConfirm={() => toRevoke && revoke.mutate(toRevoke.id)}
        title="Revoke API key?"
        message={
          <>
            <strong className="text-fg">{toRevoke?.name}</strong> will stop working immediately.
          </>
        }
        confirmLabel="Revoke"
        danger
        loading={revoke.isPending}
      />
    </AppShell>
  );
}

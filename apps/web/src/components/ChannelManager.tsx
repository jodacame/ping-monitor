import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, Mail, Plus, Send, Trash2, Webhook as WebhookIcon } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import type { Channel, ConnectorType } from '../lib/types';
import {
  Button,
  ConfirmDialog,
  Drawer,
  EmptyState,
  Field,
  Input,
  SegmentedControl,
  Select,
  Spinner,
  Switch,
  Textarea,
} from './ui';

const TYPE_META: Record<ConnectorType, { label: string; icon: typeof Mail }> = {
  smtp: { label: 'Email', icon: Mail },
  telegram: { label: 'Telegram', icon: Send },
  webhook: { label: 'Webhook', icon: WebhookIcon },
};

const TYPE_OPTIONS = [
  { value: 'smtp' as const, label: 'Email' },
  { value: 'telegram' as const, label: 'Telegram' },
  { value: 'webhook' as const, label: 'Webhook' },
];

/** Validate a webhook body template is well-formed JSON (placeholders aside). */
function isValidJsonTemplate(template: string): boolean {
  try {
    JSON.parse(template.replace(/\{\{[^}]*\}\}/g, '0'));
    return true;
  } catch {
    return false;
  }
}

function parseHeaders(text: string): Record<string, string> | undefined {
  const entries = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf(':');
      return idx > 0 ? [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] : null;
    })
    .filter((e): e is [string, string] => e !== null);
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function ChannelForm({
  workspaceId,
  onCancel,
  onCreated,
}: {
  workspaceId: string;
  onCancel: () => void;
  onCreated: () => void;
}) {
  const [type, setType] = useState<ConnectorType>('telegram');
  const [name, setName] = useState('');
  const [f, setF] = useState<Record<string, string>>({ method: 'POST', authType: 'none' });
  const [secure, setSecure] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, value: string): void => setF((p) => ({ ...p, [key]: value }));

  const jsonContentType = !f.contentType || f.contentType.toLowerCase().includes('json');
  const templateInvalid =
    type === 'webhook' &&
    Boolean(f.bodyTemplate?.trim()) &&
    jsonContentType &&
    !isValidJsonTemplate(f.bodyTemplate ?? '');

  const buildConfig = (): Record<string, unknown> => {
    if (type === 'smtp') {
      return {
        host: f.host ?? '',
        port: Number(f.port || '587'),
        secure,
        from: f.from ?? '',
        to: f.to ?? '',
        ...(f.user ? { user: f.user } : {}),
        ...(f.pass ? { pass: f.pass } : {}),
      };
    }
    if (type === 'telegram') {
      return { botToken: f.botToken ?? '', chatId: f.chatId ?? '' };
    }
    const auth =
      f.authType === 'bearer'
        ? { type: 'bearer', token: f.token ?? '' }
        : f.authType === 'basic'
          ? { type: 'basic', username: f.username ?? '', password: f.password ?? '' }
          : { type: 'none' };
    const headers = parseHeaders(f.headers ?? '');
    return {
      url: f.url ?? '',
      method: f.method ?? 'POST',
      auth,
      ...(f.contentType ? { contentType: f.contentType } : {}),
      ...(f.bodyTemplate ? { bodyTemplate: f.bodyTemplate } : {}),
      ...(headers ? { headers } : {}),
    };
  };

  const create = useMutation({
    mutationFn: () => api.createChannel(workspaceId, { type, name: name.trim(), config: buildConfig() }),
    onSuccess: onCreated,
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not save this channel.'),
  });

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-down/20 bg-down/10 px-3 py-2 text-sm text-down">
          {error}
        </div>
      )}

      <Field label="Type">
        <SegmentedControl options={TYPE_OPTIONS} value={type} onChange={setType} />
      </Field>

      <Field label="Name" hint="How you’ll recognise this destination.">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ops Telegram" />
      </Field>

      {type === 'smtp' && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="SMTP host">
                <Input value={f.host ?? ''} onChange={(e) => set('host', e.target.value)} placeholder="smtp.gmail.com" />
              </Field>
            </div>
            <Field label="Port">
              <Input value={f.port ?? ''} onChange={(e) => set('port', e.target.value)} placeholder="587" inputMode="numeric" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Input value={f.from ?? ''} onChange={(e) => set('from', e.target.value)} placeholder="alerts@you.com" />
            </Field>
            <Field label="To">
              <Input value={f.to ?? ''} onChange={(e) => set('to', e.target.value)} placeholder="you@you.com" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Username">
              <Input value={f.user ?? ''} onChange={(e) => set('user', e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" value={f.pass ?? ''} onChange={(e) => set('pass', e.target.value)} />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-fg">
            <Switch checked={secure} onChange={setSecure} label="Use TLS" />
            Use TLS (port 465)
          </label>
        </>
      )}

      {type === 'telegram' && (
        <>
          <Field label="Bot token" hint="From @BotFather.">
            <Input value={f.botToken ?? ''} onChange={(e) => set('botToken', e.target.value)} placeholder="123456:ABC-DEF…" />
          </Field>
          <Field label="Chat ID" hint="Your user or group chat id.">
            <Input value={f.chatId ?? ''} onChange={(e) => set('chatId', e.target.value)} placeholder="-1001234567890" />
          </Field>
        </>
      )}

      {type === 'webhook' && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="col-span-3">
              <Field label="URL">
                <Input value={f.url ?? ''} onChange={(e) => set('url', e.target.value)} placeholder="https://api.example.com/hook" />
              </Field>
            </div>
            <Field label="Method">
              <Select value={f.method ?? 'POST'} onChange={(e) => set('method', e.target.value)}>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </Select>
            </Field>
          </div>
          <Field label="Auth">
            <Select value={f.authType ?? 'none'} onChange={(e) => set('authType', e.target.value)}>
              <option value="none">None</option>
              <option value="bearer">Bearer token</option>
              <option value="basic">Basic auth</option>
            </Select>
          </Field>
          {f.authType === 'bearer' && (
            <Field label="Token">
              <Input type="password" value={f.token ?? ''} onChange={(e) => set('token', e.target.value)} />
            </Field>
          )}
          {f.authType === 'basic' && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Username">
                <Input value={f.username ?? ''} onChange={(e) => set('username', e.target.value)} />
              </Field>
              <Field label="Password">
                <Input type="password" value={f.password ?? ''} onChange={(e) => set('password', e.target.value)} />
              </Field>
            </div>
          )}
          <Field label="Headers" hint="One per line, e.g. X-Api-Key: abc123">
            <Textarea rows={2} value={f.headers ?? ''} onChange={(e) => set('headers', e.target.value)} placeholder="Content-Type: application/json" />
          </Field>
          <Field
            label="Body template"
            hint="Optional. Use {{title}}, {{message}}, {{status}}, {{monitorName}}, {{responseMs}}…"
            error={templateInvalid ? 'Body template must be valid JSON.' : undefined}
          >
            <Textarea
              rows={3}
              value={f.bodyTemplate ?? ''}
              onChange={(e) => set('bodyTemplate', e.target.value)}
              placeholder={'{"text":"{{title}} — {{message}}"}'}
              className="font-mono text-xs"
            />
          </Field>
        </>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => create.mutate()}
          loading={create.isPending}
          disabled={!name.trim() || templateInvalid}
        >
          Add channel
        </Button>
      </div>
    </div>
  );
}

function ChannelRow({
  channel,
  workspaceId,
  onDelete,
}: {
  channel: Channel;
  workspaceId: string;
  onDelete: () => void;
}) {
  const queryClient = useQueryClient();
  const [testState, setTestState] = useState<'idle' | 'testing' | 'ok' | 'error'>('idle');
  const [testMsg, setTestMsg] = useState<string>('');
  const meta = TYPE_META[channel.type];

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => api.updateChannel(workspaceId, channel.id, { enabled }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] }),
  });

  const runTest = async (): Promise<void> => {
    setTestState('testing');
    try {
      const res = await api.testChannel(workspaceId, channel.id);
      setTestState(res.ok ? 'ok' : 'error');
      setTestMsg(res.ok ? 'Test sent' : (res.error ?? 'Failed'));
    } catch {
      setTestState('error');
      setTestMsg('Failed');
    }
    setTimeout(() => setTestState('idle'), 4000);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-elevated text-muted">
        <meta.icon size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{channel.name}</div>
        <div className="text-xs text-muted">{meta.label}</div>
      </div>

      {testState !== 'idle' && (
        <span
          className={
            testState === 'ok'
              ? 'text-xs text-up'
              : testState === 'error'
                ? 'max-w-40 truncate text-xs text-down'
                : 'text-muted'
          }
          title={testMsg}
        >
          {testState === 'testing' ? <Spinner size={14} /> : testMsg}
        </span>
      )}

      <Button size="sm" variant="ghost" onClick={() => void runTest()} disabled={testState === 'testing'}>
        Test
      </Button>
      <Switch
        checked={channel.enabled}
        onChange={(v) => toggle.mutate(v)}
        label={channel.enabled ? 'Disable channel' : 'Enable channel'}
      />
      <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete channel">
        <Trash2 size={15} />
      </Button>
    </div>
  );
}

/** Reusable notification-channel manager: list + add (in a drawer) + test/delete. */
export function ChannelManager({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const [formOpen, setFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Channel | null>(null);

  const channels = useQuery({
    queryKey: ['channels', workspaceId],
    queryFn: () => api.listChannels(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteChannel(workspaceId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
      setToDelete(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          Where we notify you when a monitor changes state.
        </p>
        <Button leadingIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>
          Add channel
        </Button>
      </div>

      {channels.isLoading ? (
        <div className="grid place-items-center py-16 text-muted">
          <Spinner size={22} />
        </div>
      ) : channels.data && channels.data.length > 0 ? (
        <div className="space-y-2">
          {channels.data.map((c) => (
            <ChannelRow
              key={c.id}
              channel={c}
              workspaceId={workspaceId}
              onDelete={() => setToDelete(c)}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<BellRing size={22} />}
          title="No alert channels yet"
          description="Add email, Telegram, or a webhook to get notified the moment a monitor goes down."
          action={
            <Button leadingIcon={<Plus size={16} />} onClick={() => setFormOpen(true)}>
              Add channel
            </Button>
          }
        />
      )}

      <Drawer open={formOpen} onClose={() => setFormOpen(false)} title="Add channel">
        <ChannelForm
          workspaceId={workspaceId}
          onCancel={() => setFormOpen(false)}
          onCreated={() => {
            void queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
            setFormOpen(false);
          }}
        />
      </Drawer>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="Delete channel?"
        message={
          <>
            <strong className="text-fg">{toDelete?.name}</strong> will stop receiving alerts.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </div>
  );
}

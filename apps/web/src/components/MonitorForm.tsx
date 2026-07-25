import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, FolderPlus, X } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { cn } from '../lib/cn';
import type { CreateMonitorInput, Monitor, MonitorType } from '../lib/types';
import { Badge, Button, Field, IconButton, Input, SegmentedControl, Select } from './ui';
import { AssertionsBuilder, type AssertionGroup } from './AssertionsBuilder';

const INTERVALS = [
  { value: '30', label: '30s' },
  { value: '60', label: '1 min' },
  { value: '300', label: '5 min' },
  { value: '900', label: '15 min' },
] as const;

const TYPE_OPTIONS = [
  { value: 'http' as MonitorType, label: 'HTTP' },
  { value: 'tcp' as MonitorType, label: 'TCP' },
  { value: 'icmp' as MonitorType, label: 'Ping' },
];

/** Create/edit monitor form (used as a page). */
export function MonitorForm({
  workspaceId,
  monitor,
  onDone,
  onCancel,
}: {
  workspaceId: string;
  monitor?: Monitor | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const editing = Boolean(monitor);
  const queryClient = useQueryClient();

  const [type, setType] = useState<MonitorType>(monitor?.type ?? 'http');
  const [name, setName] = useState(monitor?.name ?? '');
  const [target, setTarget] = useState(monitor?.target ?? '');
  const [port, setPort] = useState(String((monitor?.config?.port as number | undefined) ?? ''));
  const [sslDays, setSslDays] = useState(
    String((monitor?.config?.sslExpiryThresholdDays as number | undefined) ?? ''),
  );
  const [interval, setInterval] = useState(String(monitor?.intervalSeconds ?? 60));
  const [timeoutMs, setTimeoutMs] = useState(String(monitor?.timeoutMs ?? 10000));
  const [failureThreshold, setFailureThreshold] = useState(String(monitor?.failureThreshold ?? 3));
  const [regionIds, setRegionIds] = useState<number[]>(monitor?.regionIds ?? []);
  const [groupId, setGroupId] = useState<string | null>(monitor?.groupId ?? null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [tagIds, setTagIds] = useState<string[]>(monitor?.tags?.map((t) => t.id) ?? []);
  const [newTag, setNewTag] = useState('');
  const [channelIds, setChannelIds] = useState<string[]>(monitor?.channelIds ?? []);
  const [assertions, setAssertions] = useState<AssertionGroup | null>(
    (monitor?.config?.assertions as AssertionGroup | undefined) ?? null,
  );
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isHttp = type === 'http';
  const isTcp = type === 'tcp';

  const regionsQuery = useQuery({ queryKey: ['regions'], queryFn: () => api.listRegions() });
  const groupsQuery = useQuery({
    queryKey: ['groups', workspaceId],
    queryFn: () => api.listGroups(workspaceId),
  });

  const createGroup = useMutation({
    mutationFn: () => api.createGroup(workspaceId, newGroup.trim()),
    onSuccess: async (group) => {
      await queryClient.invalidateQueries({ queryKey: ['groups', workspaceId] });
      setGroupId(group.id);
      setCreatingGroup(false);
      setNewGroup('');
    },
  });

  const tagsQuery = useQuery({
    queryKey: ['tags', workspaceId],
    queryFn: () => api.listTags(workspaceId),
  });
  const createTag = useMutation({
    mutationFn: () => api.createTag(workspaceId, newTag.trim()),
    onSuccess: async (tag) => {
      await queryClient.invalidateQueries({ queryKey: ['tags', workspaceId] });
      setTagIds((p) => (p.includes(tag.id) ? p : [...p, tag.id]));
      setNewTag('');
    },
  });
  const toggleTag = (id: string): void =>
    setTagIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const channelsQuery = useQuery({
    queryKey: ['channels', workspaceId],
    queryFn: () => api.listChannels(workspaceId),
  });
  const toggleChannel = (id: string): void =>
    setChannelIds((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const save = useMutation({
    mutationFn: () => {
      let config: Record<string, unknown> | undefined;
      if (type === 'http') {
        const ruleCount = assertions?.rules.length ?? 0;
        const base: Record<string, unknown> = { ...(monitor?.config ?? {}) };
        if (ruleCount > 0) base.assertions = assertions;
        else delete base.assertions;
        if (sslDays.trim()) base.sslExpiryThresholdDays = Number(sslDays);
        else delete base.sslExpiryThresholdDays;
        config = editing || ruleCount > 0 || sslDays.trim() ? base : undefined;
      } else if (type === 'tcp') {
        config = { port: Number(port) };
      } else {
        config = {};
      }

      const payload: CreateMonitorInput = {
        name: name.trim(),
        type,
        target: target.trim(),
        intervalSeconds: Number(interval),
        timeoutMs: Number(timeoutMs),
        failureThreshold: Number(failureThreshold),
        groupId,
        tagIds,
        channelIds,
        ...(regionIds.length ? { regionIds } : {}),
        ...(config !== undefined ? { config } : {}),
      };
      return monitor
        ? api.updateMonitor(workspaceId, monitor.id, payload)
        : api.createMonitor(workspaceId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['monitors', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['overview', workspaceId] });
      onDone();
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.'),
  });

  const toggleRegion = (id: number): void =>
    setRegionIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg border border-down/20 bg-down/10 px-3 py-2 text-sm text-down">
          {error}
        </div>
      )}

      <Field label="Name" hint="A friendly name, e.g. “Marketing site”.">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="My website" />
      </Field>

      <Field label="Type" hint={editing ? 'Type can’t be changed after creation.' : undefined}>
        <div className={cn(editing && 'pointer-events-none opacity-60')}>
          <SegmentedControl
            options={TYPE_OPTIONS}
            value={type}
            onChange={(v) => !editing && setType(v)}
          />
        </div>
      </Field>

      {isHttp ? (
        <Field label="URL to monitor" hint="Include https:// — we’ll check it responds correctly.">
          <Input
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="https://example.com"
            inputMode="url"
          />
        </Field>
      ) : isTcp ? (
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <Field label="Host">
              <Input
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="db.example.com"
              />
            </Field>
          </div>
          <Field label="Port">
            <Input
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="5432"
              inputMode="numeric"
            />
          </Field>
        </div>
      ) : (
        <Field label="Host" hint="Hostname or IP address to ping.">
          <Input value={target} onChange={(e) => setTarget(e.target.value)} placeholder="1.1.1.1" />
        </Field>
      )}

      <Field label="Check every">
        <SegmentedControl options={INTERVALS} value={interval} onChange={setInterval} />
      </Field>

      <Field label="Group" hint="Organise related monitors into folders.">
        {creatingGroup ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
              placeholder="Group name"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newGroup.trim()) createGroup.mutate();
              }}
            />
            <IconButton
              label="Create group"
              variant="secondary"
              onClick={() => newGroup.trim() && createGroup.mutate()}
            >
              <Check size={16} />
            </IconButton>
            <IconButton
              label="Cancel"
              onClick={() => {
                setCreatingGroup(false);
                setNewGroup('');
              }}
            >
              <X size={16} />
            </IconButton>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Select
              value={groupId ?? ''}
              onChange={(e) => setGroupId(e.target.value || null)}
              className="flex-1"
            >
              <option value="">No group</option>
              {groupsQuery.data?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <Button
              type="button"
              variant="secondary"
              leadingIcon={<FolderPlus size={15} />}
              onClick={() => setCreatingGroup(true)}
            >
              New
            </Button>
          </div>
        )}
      </Field>

      <Field label="Tags" hint="Group and filter monitors by tag.">
        <div className="space-y-2">
          {tagsQuery.data && tagsQuery.data.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tagsQuery.data.map((t) => {
                const on = tagIds.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => toggleTag(t.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      on ? 'border-transparent text-white' : 'border-border text-muted hover:text-fg',
                    )}
                    style={on ? { background: t.color } : undefined}
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: on ? '#fff' : t.color }}
                    />
                    {t.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              placeholder="New tag"
              className="h-9 max-w-40"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newTag.trim()) {
                  e.preventDefault();
                  createTag.mutate();
                }
              }}
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => newTag.trim() && createTag.mutate()}
              loading={createTag.isPending}
            >
              Add tag
            </Button>
          </div>
        </div>
      </Field>

      <Field
        label="Alerts"
        hint="Choose which channels get notified when this monitor changes state."
      >
        {channelsQuery.data && channelsQuery.data.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {channelsQuery.data.map((c) => {
              const on = channelIds.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleChannel(c.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                    on
                      ? 'border-primary/30 bg-primary/10 text-primary'
                      : 'border-border text-muted hover:text-fg',
                  )}
                >
                  {on && <Check size={13} />}
                  {c.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-muted">
            No alert channels yet. Add one under <span className="text-fg">Alerts</span> to get
            notified.
          </p>
        )}
      </Field>

      <div className="rounded-xl border border-border">
        <button
          type="button"
          onClick={() => setAdvanced((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-fg"
        >
          Advanced settings
          {advanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        <div className={cn('space-y-5 px-4 pb-4', !advanced && 'hidden')}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timeout">
              <Select value={timeoutMs} onChange={(e) => setTimeoutMs(e.target.value)}>
                <option value="5000">5 seconds</option>
                <option value="10000">10 seconds</option>
                <option value="30000">30 seconds</option>
              </Select>
            </Field>
            <Field label="Alert after" hint="Consecutive fails.">
              <Select value={failureThreshold} onChange={(e) => setFailureThreshold(e.target.value)}>
                <option value="1">1 failure</option>
                <option value="2">2 failures</option>
                <option value="3">3 failures</option>
                <option value="5">5 failures</option>
              </Select>
            </Field>
          </div>

          <Field label="Monitor from" hint="Pick the regions that will run this check.">
            <div className="flex flex-wrap gap-2">
              {regionsQuery.data?.map((region) => {
                const selected = regionIds.includes(region.id);
                return (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => toggleRegion(region.id)}
                    className={cn(
                      'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                      selected
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-border text-muted hover:text-fg',
                    )}
                  >
                    {region.name}
                  </button>
                );
              })}
              {!regionsQuery.data?.length && (
                <Badge tone="neutral">Default region will be used</Badge>
              )}
            </div>
          </Field>

          {isHttp && (
            <Field
              label="SSL certificate"
              hint="Alert if the HTTPS certificate expires within this many days (optional)."
            >
              <Input
                value={sslDays}
                onChange={(e) => setSslDays(e.target.value)}
                placeholder="14"
                inputMode="numeric"
                className="w-32"
              />
            </Field>
          )}

          {isHttp && (
            <Field
              label="Health checks"
              hint="Optional. Validate the response beyond the status code."
            >
              <AssertionsBuilder value={assertions} onChange={setAssertions} />
            </Field>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!name.trim() || !target.trim() || (isTcp && !port.trim())}
        >
          {editing ? 'Save changes' : 'Create monitor'}
        </Button>
      </div>
    </div>
  );
}

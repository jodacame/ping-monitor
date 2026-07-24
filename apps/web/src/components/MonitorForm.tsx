import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, FolderPlus, X } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { cn } from '../lib/cn';
import type { CreateMonitorInput, Monitor } from '../lib/types';
import { Badge, Button, Field, IconButton, Input, SegmentedControl, Select } from './ui';

const INTERVALS = [
  { value: '30', label: '30s' },
  { value: '60', label: '1 min' },
  { value: '300', label: '5 min' },
  { value: '900', label: '15 min' },
] as const;

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

  const [name, setName] = useState(monitor?.name ?? '');
  const [target, setTarget] = useState(monitor?.target ?? '');
  const [interval, setInterval] = useState(String(monitor?.intervalSeconds ?? 60));
  const [timeoutMs, setTimeoutMs] = useState(String(monitor?.timeoutMs ?? 10000));
  const [failureThreshold, setFailureThreshold] = useState(String(monitor?.failureThreshold ?? 3));
  const [regionIds, setRegionIds] = useState<number[]>(monitor?.regionIds ?? []);
  const [groupId, setGroupId] = useState<string | null>(monitor?.groupId ?? null);
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regionsQuery = useQuery({ queryKey: ['regions'], queryFn: api.listRegions });
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

  const save = useMutation({
    mutationFn: () => {
      const payload: CreateMonitorInput = {
        name: name.trim(),
        type: monitor?.type ?? 'http',
        target: target.trim(),
        intervalSeconds: Number(interval),
        timeoutMs: Number(timeoutMs),
        failureThreshold: Number(failureThreshold),
        groupId,
        ...(regionIds.length ? { regionIds } : {}),
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

      <Field label="URL to monitor" hint="Include https:// — we’ll check it responds correctly.">
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="https://example.com"
          inputMode="url"
        />
      </Field>

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
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-border pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          onClick={() => save.mutate()}
          loading={save.isPending}
          disabled={!name.trim() || !target.trim()}
        >
          {editing ? 'Save changes' : 'Create monitor'}
        </Button>
      </div>
    </div>
  );
}

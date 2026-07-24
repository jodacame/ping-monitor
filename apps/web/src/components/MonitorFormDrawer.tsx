import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { cn } from '../lib/cn';
import type { CreateMonitorInput, Monitor } from '../lib/types';
import { Badge, Button, Drawer, Field, Input, SegmentedControl, Select } from './ui';

const INTERVALS = [
  { value: '30', label: '30s' },
  { value: '60', label: '1 min' },
  { value: '300', label: '5 min' },
  { value: '900', label: '15 min' },
] as const;

export function MonitorFormDrawer({
  open,
  onClose,
  workspaceId,
  monitor,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  monitor?: Monitor | null;
}) {
  const editing = Boolean(monitor);
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [interval, setInterval] = useState<string>('60');
  const [timeoutMs, setTimeoutMs] = useState('10000');
  const [failureThreshold, setFailureThreshold] = useState('3');
  const [regionIds, setRegionIds] = useState<number[]>([]);
  const [advanced, setAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const regionsQuery = useQuery({ queryKey: ['regions'], queryFn: api.listRegions, enabled: open });

  // Sync form with the monitor being edited (or reset for create) when opened.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setName(monitor?.name ?? '');
    setTarget(monitor?.target ?? '');
    setInterval(String(monitor?.intervalSeconds ?? 60));
    setTimeoutMs(String(monitor?.timeoutMs ?? 10000));
    setFailureThreshold(String(monitor?.failureThreshold ?? 3));
    setRegionIds(monitor?.regionIds ?? []);
    setAdvanced(false);
  }, [open, monitor]);

  const mutation = useMutation({
    mutationFn: async () => {
      const payload: CreateMonitorInput = {
        name: name.trim(),
        type: monitor?.type ?? 'http',
        target: target.trim(),
        intervalSeconds: Number(interval),
        timeoutMs: Number(timeoutMs),
        failureThreshold: Number(failureThreshold),
        ...(regionIds.length ? { regionIds } : {}),
      };
      return monitor
        ? api.updateMonitor(workspaceId, monitor.id, payload)
        : api.createMonitor(workspaceId, payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['monitors', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['overview', workspaceId] });
      onClose();
    },
    onError: (err) => {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    },
  });

  const toggleRegion = (id: number): void => {
    setRegionIds((prev) => (prev.includes(id) ? prev.filter((r) => r !== id) : [...prev, id]));
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? 'Edit monitor' : 'New monitor'}
      subtitle={editing ? monitor?.name : 'We will start checking it right away.'}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            loading={mutation.isPending}
            disabled={!name.trim() || !target.trim()}
          >
            {editing ? 'Save changes' : 'Create monitor'}
          </Button>
        </div>
      }
    >
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
                <Select
                  value={failureThreshold}
                  onChange={(e) => setFailureThreshold(e.target.value)}
                >
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
      </div>
    </Drawer>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Pencil, Pause, Play, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { cn } from '../lib/cn';
import {
  formatDateTime,
  formatDuration,
  formatLatency,
  formatRelativeTime,
  formatUptime,
} from '../lib/format';
import type { Monitor, StatsWindow } from '../lib/types';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  SegmentedControl,
  Skeleton,
  StatusBadge,
  StatusDot,
} from './ui';
import { LatencyChart } from './LatencyChart';

const WINDOWS = [
  { value: '24h' as const, label: '24 hours' },
  { value: '7d' as const, label: '7 days' },
  { value: '30d' as const, label: '30 days' },
];

const WINDOW_MS: Record<StatsWindow, number> = {
  '24h': 24 * 3_600_000,
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-elevated/40 p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

export function MonitorDetail({
  monitor,
  workspaceId,
  onEdit,
  onClose,
}: {
  monitor: Monitor;
  workspaceId: string;
  onEdit: (m: Monitor) => void;
  onClose: () => void;
}) {
  const [window, setWindow] = useState<StatsWindow>('24h');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();
  const id = monitor.id;

  const stats = useQuery({
    queryKey: ['stats', workspaceId, id, window],
    queryFn: () => api.monitorStats(workspaceId, id, window),
  });
  const checks = useQuery({
    queryKey: ['checks', workspaceId, id],
    queryFn: () => api.monitorChecks(workspaceId, id, 15),
    refetchInterval: 15_000,
  });
  const incidents = useQuery({
    queryKey: ['incidents', workspaceId, id],
    queryFn: () => api.monitorIncidents(workspaceId, id, 10),
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['monitors', workspaceId] });
    await queryClient.invalidateQueries({ queryKey: ['overview', workspaceId] });
  };

  const paused = monitor.status === 'paused';
  const togglePause = useMutation({
    mutationFn: () =>
      paused ? api.resumeMonitor(workspaceId, id) : api.pauseMonitor(workspaceId, id),
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: () => api.deleteMonitor(workspaceId, id),
    onSuccess: async () => {
      await invalidate();
      setConfirmDelete(false);
      onClose();
    },
  });

  const summary = stats.data?.summary;

  return (
    <>
      <div className="space-y-6">
        {/* Status + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge status={monitor.status} />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={paused ? <Play size={15} /> : <Pause size={15} />}
              onClick={() => togglePause.mutate()}
              loading={togglePause.isPending}
            >
              {paused ? 'Resume' : 'Pause'}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              leadingIcon={<Pencil size={15} />}
              onClick={() => onEdit(monitor)}
            >
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              leadingIcon={<Trash2 size={15} />}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </Button>
          </div>
        </div>

        {/* Window switch */}
        <SegmentedControl options={WINDOWS} value={window} onChange={setWindow} />

        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {stats.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[70px]" />)
          ) : (
            <>
              <Stat label="Uptime" value={formatUptime(summary?.uptime)} />
              <Stat label="Avg latency" value={formatLatency(summary?.avgLatencyMs)} />
              <Stat label="Checks" value={String(summary?.checksTotal ?? 0)} />
              <Stat label="Last checked" value={formatRelativeTime(monitor.lastCheckedAt)} />
            </>
          )}
        </div>

        {/* Chart */}
        <div className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-1 text-sm font-medium text-fg">Response time (ms)</div>
          {stats.isLoading ? (
            <Skeleton className="h-[220px]" />
          ) : stats.data && stats.data.series.length > 0 ? (
            <LatencyChart
              series={stats.data.series}
              to={Date.now()}
              from={Date.now() - WINDOW_MS[window]}
            />
          ) : (
            <div className="grid h-[220px] place-items-center text-sm text-muted">
              No data yet — checks will appear here shortly.
            </div>
          )}
        </div>

        {/* Recent checks */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">Recent checks</h3>
          <div className="overflow-hidden rounded-xl border border-border">
            {checks.data?.length ? (
              checks.data.map((c, i) => (
                <div
                  key={i}
                  className="flex items-center gap-3 border-b border-border px-3 py-2.5 text-sm last:border-0"
                >
                  <StatusDot status={c.up ? 'up' : 'down'} size={8} />
                  <span className="flex-1 text-muted">{formatDateTime(c.checkedAt)}</span>
                  <span className="text-xs text-muted">region {c.regionId}</span>
                  <span className="w-16 text-right font-medium tabular-nums text-fg">
                    {formatLatency(c.responseMs)}
                  </span>
                  <span className="w-14 text-right text-xs text-muted">
                    {c.up ? (c.statusCode ?? 'OK') : (c.errorKind ?? 'fail')}
                  </span>
                </div>
              ))
            ) : (
              <div className="px-3 py-6 text-center text-sm text-muted">No checks recorded yet.</div>
            )}
          </div>
        </section>

        {/* Incidents */}
        <section>
          <h3 className="mb-2 text-sm font-semibold text-fg">Incident history</h3>
          {incidents.data?.length ? (
            <div className="space-y-2">
              {incidents.data.map((incident) => (
                <div
                  key={incident.publicId}
                  className={cn(
                    'flex items-start gap-3 rounded-xl border p-3',
                    incident.resolvedAt ? 'border-border' : 'border-down/30 bg-down/5',
                  )}
                >
                  <AlertTriangle
                    size={16}
                    className={incident.resolvedAt ? 'text-muted' : 'text-down'}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-fg">
                      {incident.resolvedAt ? 'Resolved' : 'Ongoing outage'}
                    </div>
                    <div className="text-xs text-muted">
                      {formatDateTime(incident.startedAt)} · {formatDuration(incident.durationSeconds)}
                      {incident.causeMessage ? ` · ${incident.causeMessage}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No incidents" description="This monitor hasn’t had any downtime." />
          )}
        </section>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => remove.mutate()}
        title="Delete monitor?"
        message={
          <>
            <strong className="text-fg">{monitor.name}</strong> and its history will be permanently
            removed. This cannot be undone.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </>
  );
}

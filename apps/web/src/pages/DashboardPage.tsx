import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, CheckCircle2, PauseCircle, Plus, Radar, Search, XCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Monitor } from '../lib/types';
import { AppShell } from '../components/AppShell';
import { StatTile } from '../components/StatTile';
import { MonitorList } from '../components/MonitorList';
import { MonitorDetailDrawer } from '../components/MonitorDetailDrawer';
import { MonitorFormDrawer } from '../components/MonitorFormDrawer';
import {
  Badge,
  Button,
  Drawer,
  EmptyState,
  Input,
  SegmentedControl,
  Skeleton,
} from '../components/ui';
import { prettyTarget } from '../lib/format';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'paused', label: 'Paused' },
] as const;

export function DashboardPage() {
  const { currentWorkspace } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id ?? '';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [selected, setSelected] = useState<Monitor | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Monitor | null>(null);

  const overview = useQuery({
    queryKey: ['overview', workspaceId],
    queryFn: () => api.overview(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: 15_000,
  });

  const monitors = useQuery({
    queryKey: ['monitors', workspaceId, { search, status }],
    queryFn: () =>
      api.listMonitors(workspaceId, {
        pageSize: 100,
        ...(search ? { search } : {}),
        ...(status !== 'all' ? { status } : {}),
      }),
    enabled: Boolean(workspaceId),
    refetchInterval: 15_000,
  });

  const togglePause = useMutation({
    mutationFn: (m: Monitor) =>
      m.status === 'paused'
        ? api.resumeMonitor(workspaceId, m.id)
        : api.pauseMonitor(workspaceId, m.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['monitors', workspaceId] });
      await queryClient.invalidateQueries({ queryKey: ['overview', workspaceId] });
    },
  });

  const items = monitors.data?.items ?? [];
  const o = overview.data;

  const openNew = (): void => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (m: Monitor): void => {
    setSelected(null);
    setEditing(m);
    setFormOpen(true);
  };

  // Keep the selected monitor's data fresh from the list after refetches.
  const selectedLive = useMemo(
    () => (selected ? (items.find((m) => m.id === selected.id) ?? selected) : null),
    [selected, items],
  );

  return (
    <AppShell
      title={
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-fg">Monitors</span>
          {o && <Badge tone="neutral">{o.total}</Badge>}
        </div>
      }
      actions={
        <Button leadingIcon={<Plus size={16} />} onClick={openNew} className="hidden sm:inline-flex">
          New monitor
        </Button>
      }
    >
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        {/* KPI tiles */}
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <StatTile label="Total monitors" value={o?.total ?? '—'} icon={Radar} tone="primary" delay={0} />
          <StatTile label="Operational" value={o?.up ?? '—'} icon={CheckCircle2} tone="up" delay={60} />
          <StatTile label="Down" value={o?.down ?? '—'} icon={XCircle} tone="down" delay={120} />
          <StatTile
            label="Paused"
            value={(o ? o.paused + o.pending : '—') as number | string}
            icon={PauseCircle}
            tone="neutral"
            delay={180}
          />
        </div>

        {/* Filters */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search monitors…"
              className="pl-9"
            />
          </div>
          <SegmentedControl options={STATUS_FILTERS} value={status} onChange={setStatus} />
        </div>

        {/* List */}
        {monitors.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16" />
            ))}
          </div>
        ) : items.length > 0 ? (
          <MonitorList
            monitors={items}
            onSelect={setSelected}
            onTogglePause={(m) => togglePause.mutate(m)}
          />
        ) : (
          <EmptyState
            icon={<Activity size={22} />}
            title={search || status !== 'all' ? 'No monitors match your filters' : 'No monitors yet'}
            description={
              search || status !== 'all'
                ? 'Try a different search or filter.'
                : 'Add your first monitor and we’ll start watching it immediately.'
            }
            action={
              !search && status === 'all' ? (
                <Button leadingIcon={<Plus size={16} />} onClick={openNew}>
                  New monitor
                </Button>
              ) : undefined
            }
          />
        )}
      </div>

      {/* Floating action button on mobile */}
      <button
        onClick={openNew}
        aria-label="New monitor"
        className="fixed bottom-6 right-6 z-20 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg shadow-xl shadow-primary/30 transition-transform hover:scale-105 active:scale-95 sm:hidden"
      >
        <Plus size={24} />
      </button>

      {/* Detail drawer */}
      <Drawer
        open={Boolean(selectedLive)}
        onClose={() => setSelected(null)}
        title={selectedLive?.name}
        subtitle={selectedLive ? prettyTarget(selectedLive.target) : undefined}
      >
        {selectedLive && (
          <MonitorDetailDrawer
            monitor={selectedLive}
            workspaceId={workspaceId}
            onEdit={openEdit}
            onClose={() => setSelected(null)}
          />
        )}
      </Drawer>

      {/* Create / edit drawer */}
      <MonitorFormDrawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        workspaceId={workspaceId}
        monitor={editing}
      />
    </AppShell>
  );
}

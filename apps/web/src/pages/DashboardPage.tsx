import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Activity, FolderPlus, Plus, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Monitor, MonitorGroup } from '../lib/types';
import { AppShell } from '../components/AppShell';
import { DashboardAside } from '../components/DashboardAside';
import { MonitorList } from '../components/MonitorList';
import { MonitorGroups } from '../components/MonitorGroups';
import {
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  IconButton,
  Input,
  SegmentedControl,
  Select,
  Skeleton,
} from '../components/ui';

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'up', label: 'Up' },
  { value: 'down', label: 'Down' },
  { value: 'paused', label: 'Paused' },
] as const;

export function DashboardPage() {
  const { currentWorkspace } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id ?? '';

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState('');
  const [groupToDelete, setGroupToDelete] = useState<MonitorGroup | null>(null);

  const overview = useQuery({
    queryKey: ['overview', workspaceId],
    queryFn: () => api.overview(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: 15_000,
  });
  const insights = useQuery({
    queryKey: ['insights', workspaceId],
    queryFn: () => api.insights(workspaceId),
    enabled: Boolean(workspaceId),
    refetchInterval: 15_000,
  });
  const monitors = useQuery({
    queryKey: ['monitors', workspaceId, { search, status, tagFilter }],
    queryFn: () =>
      api.listMonitors(workspaceId, {
        pageSize: 100,
        ...(search ? { search } : {}),
        ...(status !== 'all' ? { status } : {}),
        ...(tagFilter ? { tagId: tagFilter } : {}),
      }),
    enabled: Boolean(workspaceId),
    refetchInterval: 15_000,
  });
  const tags = useQuery({
    queryKey: ['tags', workspaceId],
    queryFn: () => api.listTags(workspaceId),
    enabled: Boolean(workspaceId),
  });
  const groups = useQuery({
    queryKey: ['groups', workspaceId],
    queryFn: () => api.listGroups(workspaceId),
    enabled: Boolean(workspaceId),
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

  const invalidateGroups = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['groups', workspaceId] });
    await queryClient.invalidateQueries({ queryKey: ['monitors', workspaceId] });
  };
  const createGroup = useMutation({
    mutationFn: () => api.createGroup(workspaceId, 'New group'),
    onSuccess: invalidateGroups,
  });
  const renameGroup = useMutation({
    mutationFn: (v: { id: string; name: string }) => api.renameGroup(workspaceId, v.id, v.name),
    onSuccess: invalidateGroups,
  });
  const deleteGroup = useMutation({
    mutationFn: (id: string) => api.deleteGroup(workspaceId, id),
    onSuccess: async () => {
      await invalidateGroups();
      setGroupToDelete(null);
    },
  });

  const items = monitors.data?.items ?? [];
  const groupList = groups.data ?? [];
  const openMonitor = (m: Monitor): void => {
    navigate(`/monitors/${m.id}`);
  };

  return (
    <AppShell
      title={
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold text-fg">Monitors</span>
          {overview.data && <Badge tone="neutral">{overview.data.total}</Badge>}
        </div>
      }
      actions={
        <Button
          leadingIcon={<Plus size={16} />}
          onClick={() => navigate('/monitors/new')}
          className="hidden sm:inline-flex"
        >
          New monitor
        </Button>
      }
    >
      <div className="mx-auto max-w-7xl p-4 sm:p-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          <main className="order-2 min-w-0 flex-1 space-y-4 lg:order-1">
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
              <div className="flex items-center gap-2">
                <SegmentedControl options={STATUS_FILTERS} value={status} onChange={setStatus} />
                {tags.data && tags.data.length > 0 && (
                  <Select
                    value={tagFilter}
                    onChange={(e) => setTagFilter(e.target.value)}
                    className="h-9 w-auto"
                  >
                    <option value="">All tags</option>
                    {tags.data.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                )}
                <IconButton
                  label="New group"
                  variant="secondary"
                  onClick={() => createGroup.mutate()}
                >
                  <FolderPlus size={16} />
                </IconButton>
              </div>
            </div>

            {monitors.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-16" />
                ))}
              </div>
            ) : items.length > 0 || groupList.length > 0 ? (
              groupList.length > 0 ? (
                <MonitorGroups
                  groups={groupList}
                  monitors={items}
                  onSelect={openMonitor}
                  onTogglePause={(m) => togglePause.mutate(m)}
                  onRenameGroup={(id, name) => renameGroup.mutate({ id, name })}
                  onDeleteGroup={setGroupToDelete}
                />
              ) : (
                <MonitorList
                  monitors={items}
                  onSelect={openMonitor}
                  onTogglePause={(m) => togglePause.mutate(m)}
                />
              )
            ) : (
              <EmptyState
                icon={<Activity size={22} />}
                title={
                  search || status !== 'all' ? 'No monitors match your filters' : 'No monitors yet'
                }
                description={
                  search || status !== 'all'
                    ? 'Try a different search or filter.'
                    : 'Add your first monitor and we’ll start watching it immediately.'
                }
                action={
                  !search && status === 'all' ? (
                    <Button leadingIcon={<Plus size={16} />} onClick={() => navigate('/monitors/new')}>
                      New monitor
                    </Button>
                  ) : undefined
                }
              />
            )}
          </main>

          <aside className="order-1 shrink-0 lg:order-2 lg:w-80">
            <div className="lg:sticky lg:top-20">
              <DashboardAside
                overview={overview.data}
                insights={insights.data}
                monitors={items}
                onSelect={openMonitor}
                loading={overview.isLoading || insights.isLoading}
              />
            </div>
          </aside>
        </div>
      </div>

      <button
        onClick={() => navigate('/monitors/new')}
        aria-label="New monitor"
        className="fixed bottom-6 right-6 z-20 grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-fg shadow-xl shadow-primary/30 transition-transform hover:scale-105 active:scale-95 sm:hidden"
      >
        <Plus size={24} />
      </button>

      <ConfirmDialog
        open={Boolean(groupToDelete)}
        onClose={() => setGroupToDelete(null)}
        onConfirm={() => groupToDelete && deleteGroup.mutate(groupToDelete.id)}
        title="Delete group?"
        message={
          <>
            <strong className="text-fg">{groupToDelete?.name}</strong> will be removed. Its monitors
            are kept and moved to Ungrouped.
          </>
        }
        confirmLabel="Delete group"
        danger
        loading={deleteGroup.isPending}
      />
    </AppShell>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Globe2, Plus, Trash2 } from 'lucide-react';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { cn } from '../lib/cn';
import type { StatusPageSummary } from '../lib/types';
import { AppShell } from '../components/AppShell';
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Spinner } from '../components/ui';

function CreateForm({
  workspaceId,
  onCreated,
  onCancel,
}: {
  workspaceId: string;
  onCreated: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const monitors = useQuery({
    queryKey: ['monitors', workspaceId, { all: true }],
    queryFn: () => api.listMonitors(workspaceId, { pageSize: 100 }),
  });

  const create = useMutation({
    mutationFn: () =>
      api.createStatusPage(workspaceId, {
        title: title.trim(),
        ...(slug.trim() ? { slug: slug.trim() } : {}),
        ...(description.trim() ? { description: description.trim() } : {}),
        monitorIds: selected,
      }),
    onSuccess: onCreated,
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'Could not create the status page.'),
  });

  const toggle = (id: string): void =>
    setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Card className="space-y-4 p-5">
      {error && (
        <div className="rounded-lg border border-down/20 bg-down/10 px-3 py-2 text-sm text-down">
          {error}
        </div>
      )}
      <Field label="Title">
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Acme Status" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="URL slug" hint="Leave blank to auto-generate.">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="acme" />
        </Field>
        <Field label="Description">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Live service status"
          />
        </Field>
      </div>

      <Field label="Monitors on this page">
        <div className="flex max-h-56 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-2">
          {monitors.data?.items.map((m) => (
            <label
              key={m.id}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-elevated',
                selected.includes(m.id) && 'text-fg',
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(m.id)}
                onChange={() => toggle(m.id)}
                className="accent-[var(--primary)]"
              />
              <span className="truncate">{m.name}</span>
            </label>
          ))}
          {!monitors.data?.items.length && (
            <span className="px-2 py-1 text-sm text-muted">No monitors yet.</span>
          )}
        </div>
      </Field>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!title.trim()}>
          Create status page
        </Button>
      </div>
    </Card>
  );
}

function PageRow({
  page,
  onDelete,
}: {
  page: StatusPageSummary;
  onDelete: () => void;
}) {
  const url = `${window.location.origin}/status/${page.slug}`;
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-elevated text-muted">
        <Globe2 size={17} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{page.title}</div>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 truncate text-xs text-primary hover:underline"
        >
          /status/{page.slug} <ExternalLink size={11} />
        </a>
      </div>
      <Button size="sm" variant="ghost" onClick={onDelete} aria-label="Delete status page">
        <Trash2 size={15} />
      </Button>
    </Card>
  );
}

export function StatusPagesPage() {
  const { currentWorkspace } = useAuth();
  const queryClient = useQueryClient();
  const workspaceId = currentWorkspace?.id ?? '';
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<StatusPageSummary | null>(null);

  const pages = useQuery({
    queryKey: ['status-pages', workspaceId],
    queryFn: () => api.listStatusPages(workspaceId),
    enabled: Boolean(workspaceId),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteStatusPage(workspaceId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['status-pages', workspaceId] });
      setToDelete(null);
    },
  });

  const refresh = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['status-pages', workspaceId] });
    setCreating(false);
  };

  return (
    <AppShell
      title="Status Pages"
      actions={
        <Button leadingIcon={<Plus size={16} />} onClick={() => setCreating((v) => !v)}>
          New status page
        </Button>
      }
    >
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        {creating && (
          <CreateForm
            workspaceId={workspaceId}
            onCreated={() => void refresh()}
            onCancel={() => setCreating(false)}
          />
        )}

        {pages.isLoading ? (
          <div className="grid place-items-center py-16 text-muted">
            <Spinner size={22} />
          </div>
        ) : pages.data && pages.data.length > 0 ? (
          <div className="space-y-2">
            {pages.data.map((p) => (
              <PageRow key={p.id} page={p} onDelete={() => setToDelete(p)} />
            ))}
          </div>
        ) : (
          !creating && (
            <EmptyState
              icon={<Globe2 size={22} />}
              title="No status pages yet"
              description="Publish a public page showing the live status of the monitors you choose."
              action={
                <Button leadingIcon={<Plus size={16} />} onClick={() => setCreating(true)}>
                  New status page
                </Button>
              }
            />
          )
        )}
      </div>

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        title="Delete status page?"
        message={
          <>
            <strong className="text-fg">{toDelete?.title}</strong> will no longer be publicly
            reachable.
          </>
        }
        confirmLabel="Delete"
        danger
        loading={remove.isPending}
      />
    </AppShell>
  );
}

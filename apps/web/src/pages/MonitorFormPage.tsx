import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { AppShell } from '../components/AppShell';
import { MonitorForm } from '../components/MonitorForm';
import { IconButton, Spinner } from '../components/ui';

export function MonitorFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.id ?? '';
  const editing = Boolean(id);

  const query = useQuery({
    queryKey: ['monitor', workspaceId, id],
    queryFn: () => api.getMonitor(workspaceId, id as string),
    enabled: editing && Boolean(workspaceId),
  });

  const back = (): void => {
    navigate(editing ? `/monitors/${id}` : '/');
  };

  return (
    <AppShell
      title={
        <div className="flex items-center gap-2">
          <IconButton label="Back" onClick={back}>
            <ArrowLeft size={18} />
          </IconButton>
          <span className="text-lg font-semibold text-fg">
            {editing ? 'Edit monitor' : 'New monitor'}
          </span>
        </div>
      }
    >
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        {editing && query.isLoading ? (
          <div className="grid place-items-center py-20 text-muted">
            <Spinner size={24} />
          </div>
        ) : (
          <MonitorForm
            workspaceId={workspaceId}
            monitor={editing ? query.data : null}
            onDone={back}
            onCancel={back}
          />
        )}
      </div>
    </AppShell>
  );
}

import { useNavigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { prettyTarget } from '../lib/format';
import { AppShell } from '../components/AppShell';
import { MonitorDetail } from '../components/MonitorDetail';
import { EmptyState, IconButton, Spinner } from '../components/ui';

export function MonitorDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.id ?? '';

  const query = useQuery({
    queryKey: ['monitor', workspaceId, id],
    queryFn: () => api.getMonitor(workspaceId, id),
    enabled: Boolean(workspaceId && id),
  });
  const monitor = query.data;

  return (
    <AppShell
      title={
        <div className="flex min-w-0 items-center gap-2">
          <IconButton label="Back to monitors" onClick={() => navigate('/')}>
            <ArrowLeft size={18} />
          </IconButton>
          <div className="min-w-0">
            <div className="truncate text-lg font-semibold text-fg">{monitor?.name ?? 'Monitor'}</div>
            {monitor && (
              <div className="truncate text-xs text-muted">{prettyTarget(monitor.target)}</div>
            )}
          </div>
        </div>
      }
    >
      <div className="mx-auto max-w-3xl p-4 sm:p-6">
        {query.isLoading ? (
          <div className="grid place-items-center py-20 text-muted">
            <Spinner size={24} />
          </div>
        ) : monitor ? (
          <MonitorDetail
            monitor={monitor}
            workspaceId={workspaceId}
            onEdit={() => navigate(`/monitors/${id}/edit`)}
            onClose={() => navigate('/')}
          />
        ) : (
          <EmptyState title="Monitor not found" description="It may have been deleted." />
        )}
      </div>
    </AppShell>
  );
}

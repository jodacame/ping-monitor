import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { AppShell } from '../components/AppShell';
import { ChannelForm } from '../components/ChannelManager';
import { IconButton } from '../components/ui';

export function ChannelFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { currentWorkspace } = useAuth();
  const workspaceId = currentWorkspace?.id ?? '';

  const done = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['channels', workspaceId] });
    navigate('/alerts');
  };

  return (
    <AppShell
      title={
        <div className="flex items-center gap-2">
          <IconButton label="Back to alerts" onClick={() => navigate('/alerts')}>
            <ArrowLeft size={18} />
          </IconButton>
          <span className="text-lg font-semibold text-fg">Add channel</span>
        </div>
      }
    >
      <div className="mx-auto max-w-2xl p-4 sm:p-6">
        <ChannelForm workspaceId={workspaceId} onCancel={() => navigate('/alerts')} onCreated={done} />
      </div>
    </AppShell>
  );
}

import { AppShell } from '../components/AppShell';
import { ChannelManager } from '../components/ChannelManager';
import { useAuth } from '../lib/auth';

export function AlertsPage() {
  const { currentWorkspace } = useAuth();
  return (
    <AppShell title="Alerts">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <ChannelManager workspaceId={currentWorkspace?.id ?? ''} />
      </div>
    </AppShell>
  );
}

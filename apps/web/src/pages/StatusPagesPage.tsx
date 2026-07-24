import { Globe2 } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { EmptyState } from '../components/ui';

export function StatusPagesPage() {
  return (
    <AppShell title="Status Pages">
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <EmptyState
          icon={<Globe2 size={22} />}
          title="Public status pages are on the way"
          description="Soon you’ll be able to publish a branded page that shows the live status and uptime of the monitors you choose."
        />
      </div>
    </AppShell>
  );
}

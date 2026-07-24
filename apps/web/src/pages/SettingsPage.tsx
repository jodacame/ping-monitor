import { LogOut } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { useAuth } from '../lib/auth';
import { useTheme, type Theme } from '../lib/theme';
import { Button, Card, SegmentedControl } from '../components/ui';

const THEME_OPTIONS = [
  { value: 'light' as Theme, label: 'Light' },
  { value: 'dark' as Theme, label: 'Dark' },
];

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-medium text-fg">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { user, currentWorkspace, workspaces, logout } = useAuth();
  const { theme, setTheme } = useTheme();

  return (
    <AppShell title="Settings">
      <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg">Appearance</h2>
          <Card className="flex items-center justify-between p-4">
            <div>
              <div className="text-sm font-medium text-fg">Theme</div>
              <div className="text-xs text-muted">Choose a light or dark interface.</div>
            </div>
            <SegmentedControl options={THEME_OPTIONS} value={theme} onChange={setTheme} />
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg">Account</h2>
          <Card className="px-4">
            <Row label="Name" value={user?.name ?? '—'} />
            <Row label="Email" value={user?.email ?? '—'} />
          </Card>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold text-fg">Workspace</h2>
          <Card className="px-4">
            <Row label="Current workspace" value={currentWorkspace?.name ?? '—'} />
            <Row label="Your role" value={currentWorkspace?.role ?? '—'} />
            <Row label="Workspaces" value={String(workspaces.length)} />
          </Card>
        </section>

        <Button variant="secondary" leadingIcon={<LogOut size={16} />} onClick={() => void logout()}>
          Sign out
        </Button>
      </div>
    </AppShell>
  );
}

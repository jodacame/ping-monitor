import { useState, type FormEvent } from 'react';
import { LogOut } from 'lucide-react';
import { AppShell } from '../components/AppShell';
import { ApiError, api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme, type Theme } from '../lib/theme';
import { Button, Card, Field, Input, SegmentedControl } from '../components/ui';

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

function ChangePasswordCard() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError('The new passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      await api.changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to change your password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4">
      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-down/20 bg-down/10 px-3 py-2 text-sm text-down">
            {error}
          </div>
        )}
        {done && (
          <div className="rounded-lg border border-up/20 bg-up/10 px-3 py-2 text-sm text-up">
            Password updated. Other devices have been signed out.
          </div>
        )}
        <Field label="Current password">
          <Input
            type="password"
            required
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="New password" hint="At least 8 characters.">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="••••••••"
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={loading} disabled={!current || !next || !confirm}>
            Update password
          </Button>
        </div>
      </form>
    </Card>
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
          <h2 className="mb-2 text-sm font-semibold text-fg">Security</h2>
          <ChangePasswordCard />
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

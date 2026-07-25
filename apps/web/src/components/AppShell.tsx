import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BellRing,
  Check,
  ChevronsUpDown,
  Code2,
  Globe2,
  LayoutDashboard,
  LogOut,
  Menu,
  Plus,
  Settings,
  X,
} from 'lucide-react';
import { cn } from '../lib/cn';
import { useAuth } from '../lib/auth';
import type { Workspace } from '../lib/types';
import { api } from '../lib/api';
import { Button, Field, IconButton, Input, Modal } from './ui';
import { Brand } from './Brand';

const NAV = [
  { icon: LayoutDashboard, label: 'Dashboard', to: '/' },
  { icon: BellRing, label: 'Alerts', to: '/alerts' },
  { icon: Globe2, label: 'Status Pages', to: '/status-pages' },
  { icon: Code2, label: 'Developers', to: '/developers' },
  { icon: Settings, label: 'Settings', to: '/settings' },
];

function WorkspaceSwitcher() {
  const { workspaces, currentWorkspace, selectWorkspace, reload } = useAuth();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  if (!currentWorkspace) return null;

  const create = async (): Promise<void> => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const ws = await api.createWorkspace(name.trim());
      await reload();
      selectWorkspace(ws.id);
      setCreating(false);
      setName('');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-lg border border-border bg-elevated px-3 py-2 text-left transition-colors hover:border-primary/30"
      >
        <div className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-primary/15 text-xs font-semibold text-primary">
          {currentWorkspace.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-fg">{currentWorkspace.name}</div>
          <div className="truncate text-[11px] capitalize text-muted">{currentWorkspace.role}</div>
        </div>
        <ChevronsUpDown size={15} className="shrink-0 text-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.98 }}
              transition={{ duration: 0.15 }}
              className="absolute bottom-full z-20 mb-2 w-full overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-xl"
            >
              {workspaces.map((w: Workspace) => (
                <button
                  key={w.id}
                  onClick={() => {
                    selectWorkspace(w.id);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-fg hover:bg-elevated"
                >
                  <span className="flex-1 truncate">{w.name}</span>
                  {w.id === currentWorkspace.id && <Check size={15} className="text-primary" />}
                </button>
              ))}
              <button
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                className="mt-1 flex w-full items-center gap-2 border-t border-border px-2.5 py-2 text-left text-sm font-medium text-primary hover:bg-elevated"
              >
                <Plus size={15} /> New workspace
              </button>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <Modal open={creating} onClose={() => setCreating(false)}>
        <h3 className="text-lg font-semibold text-fg">New workspace</h3>
        <div className="mt-4">
          <Field label="Name">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Acme Inc."
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
            />
          </Field>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setCreating(false)}>
            Cancel
          </Button>
          <Button onClick={() => void create()} loading={saving} disabled={!name.trim()}>
            Create workspace
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function UserFooter() {
  const { user, logout } = useAuth();
  if (!user) return null;
  const initials = (user.name ?? user.email).charAt(0).toUpperCase();
  return (
    <div className="flex items-center gap-2.5 border-t border-border px-3 py-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-elevated text-sm font-semibold text-fg">
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-fg">{user.name ?? 'You'}</div>
        <div className="truncate text-xs text-muted">{user.email}</div>
      </div>
      <IconButton label="Sign out" size="sm" onClick={() => void logout()}>
        <LogOut size={16} />
      </IconButton>
    </div>
  );
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const isActive = (to: string): boolean => (to === '/' ? pathname === '/' : pathname.startsWith(to));

  return (
    <div className="flex h-full flex-col">
      <div className="px-4 py-5">
        <Brand />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {NAV.map((item) => (
          <button
            key={item.label}
            onClick={() => {
              void navigate(item.to);
              onNavigate?.();
            }}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
              isActive(item.to)
                ? 'bg-primary/10 text-primary'
                : 'text-muted hover:bg-elevated hover:text-fg',
            )}
          >
            <item.icon size={18} />
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="p-3">
        <WorkspaceSwitcher />
      </div>
      <UserFooter />
    </div>
  );
}

/** App layout: fixed sidebar on desktop, slide-in nav on mobile, sticky topbar. */
export function AppShell({
  title,
  actions,
  children,
}: {
  title?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="flex h-full">
      <aside className="hidden w-64 shrink-0 border-r border-border bg-surface lg:block">
        <SidebarContent />
      </aside>

      <AnimatePresence>
        {mobileOpen && (
          <div className="fixed inset-0 z-50 lg:hidden">
            <motion.div
              className="absolute inset-0 bg-black/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="absolute inset-y-0 left-0 w-72 max-w-[85%] border-r border-border bg-surface"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 40 }}
            >
              <div className="absolute right-2 top-3">
                <IconButton label="Close menu" onClick={() => setMobileOpen(false)}>
                  <X size={18} />
                </IconButton>
              </div>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-bg/80 px-4 backdrop-blur sm:px-6">
          <IconButton label="Open menu" className="lg:hidden" onClick={() => setMobileOpen(true)}>
            <Menu size={20} />
          </IconButton>
          <div className="min-w-0 flex-1">
            {typeof title === 'string' ? (
              <h1 className="truncate text-lg font-semibold text-fg">{title}</h1>
            ) : (
              title
            )}
          </div>
          <div className="flex items-center gap-2">{actions}</div>
        </header>

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

import { useMemo, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Folder, Inbox, Pencil, Trash2 } from 'lucide-react';
import { cn } from '../lib/cn';
import type { Monitor, MonitorGroup } from '../lib/types';
import { Badge, IconButton, Input } from './ui';
import { MonitorList } from './MonitorList';

const COLLAPSE_KEY = 'pm.collapsedGroups';

function loadCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]') as string[]);
  } catch {
    return new Set();
  }
}

interface SectionProps {
  id: string;
  title: string;
  monitors: Monitor[];
  collapsed: boolean;
  onToggle: () => void;
  onSelect: (m: Monitor) => void;
  onTogglePause: (m: Monitor) => void;
  onRename?: (name: string) => void;
  onDelete?: () => void;
  icon: 'folder' | 'inbox';
}

function Section({
  title,
  monitors,
  collapsed,
  onToggle,
  onSelect,
  onTogglePause,
  onRename,
  onDelete,
  icon,
}: SectionProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const Icon = icon === 'folder' ? Folder : Inbox;

  const commit = (): void => {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onRename?.(next);
    else setDraft(title);
  };

  return (
    <section>
      <div className="group/section flex items-center gap-2 px-1 py-2">
        <button
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
          aria-expanded={!collapsed}
        >
          <ChevronDown
            size={16}
            className={cn('shrink-0 text-muted transition-transform', collapsed && '-rotate-90')}
          />
          <Icon size={15} className="shrink-0 text-muted" />
          {editing ? (
            <Input
              autoFocus
              value={draft}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e: KeyboardEvent) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') {
                  setDraft(title);
                  setEditing(false);
                }
              }}
              className="h-7 max-w-56 py-0"
            />
          ) : (
            <span className="truncate text-sm font-semibold text-fg">{title}</span>
          )}
          <Badge tone="neutral">{monitors.length}</Badge>
        </button>

        {(onRename || onDelete) && (
          <div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover/section:opacity-100">
            {onRename && (
              <IconButton
                label="Rename group"
                size="sm"
                onClick={() => {
                  setDraft(title);
                  setEditing(true);
                }}
              >
                <Pencil size={14} />
              </IconButton>
            )}
            {onDelete && (
              <IconButton label="Delete group" size="sm" onClick={onDelete}>
                <Trash2 size={14} />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {!collapsed &&
        (monitors.length > 0 ? (
          <MonitorList monitors={monitors} onSelect={onSelect} onTogglePause={onTogglePause} />
        ) : (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
            No monitors in this group yet.
          </div>
        ))}
    </section>
  );
}

/** The monitor list organised into collapsible one-level groups. */
export function MonitorGroups({
  groups,
  monitors,
  onSelect,
  onTogglePause,
  onRenameGroup,
  onDeleteGroup,
}: {
  groups: MonitorGroup[];
  monitors: Monitor[];
  onSelect: (m: Monitor) => void;
  onTogglePause: (m: Monitor) => void;
  onRenameGroup: (id: string, name: string) => void;
  onDeleteGroup: (group: MonitorGroup) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(loadCollapsed);

  const toggle = (id: string): void => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...next]));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const { buckets, ungrouped } = useMemo(() => {
    const map = new Map<string, Monitor[]>(groups.map((g) => [g.id, []]));
    const loose: Monitor[] = [];
    for (const m of monitors) {
      if (m.groupId && map.has(m.groupId)) map.get(m.groupId)!.push(m);
      else loose.push(m);
    }
    return { buckets: map, ungrouped: loose };
  }, [groups, monitors]);

  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <Section
          key={group.id}
          id={group.id}
          title={group.name}
          icon="folder"
          monitors={buckets.get(group.id) ?? []}
          collapsed={collapsed.has(group.id)}
          onToggle={() => toggle(group.id)}
          onSelect={onSelect}
          onTogglePause={onTogglePause}
          onRename={(name) => onRenameGroup(group.id, name)}
          onDelete={() => onDeleteGroup(group)}
        />
      ))}

      {ungrouped.length > 0 && (
        <Section
          id="__ungrouped"
          title="Ungrouped"
          icon="inbox"
          monitors={ungrouped}
          collapsed={collapsed.has('__ungrouped')}
          onToggle={() => toggle('__ungrouped')}
          onSelect={onSelect}
          onTogglePause={onTogglePause}
        />
      )}
    </div>
  );
}

import { cn } from '../../lib/cn';
import type { MonitorStatus } from '../../lib/types';
import { Badge } from './Badge';

interface StatusMeta {
  label: string;
  color: string;
  tone: 'up' | 'down' | 'warn' | 'neutral';
}

export const STATUS_META: Record<MonitorStatus, StatusMeta> = {
  up: { label: 'Operational', color: 'var(--up)', tone: 'up' },
  down: { label: 'Down', color: 'var(--down)', tone: 'down' },
  pending: { label: 'Checking', color: 'var(--warn)', tone: 'warn' },
  paused: { label: 'Paused', color: 'var(--pending)', tone: 'neutral' },
};

/** A status dot; when the monitor is up it emits a gentle live pulse ring. */
export function StatusDot({ status, size = 10 }: { status: MonitorStatus; size?: number }) {
  const meta = STATUS_META[status];
  const live = status === 'up';
  return (
    <span className="relative inline-flex shrink-0" style={{ width: size, height: size }}>
      {live && (
        <span
          className="absolute inset-0 rounded-full"
          style={{ background: meta.color, animation: 'pulse-ring 1.8s cubic-bezier(0,0,0.2,1) infinite' }}
        />
      )}
      <span
        className="relative inline-block rounded-full"
        style={{
          width: size,
          height: size,
          background: meta.color,
          boxShadow: `0 0 0 3px color-mix(in oklab, ${meta.color} 18%, transparent)`,
        }}
      />
    </span>
  );
}

/** Dot + human-readable label as a pill. */
export function StatusBadge({ status, className }: { status: MonitorStatus; className?: string }) {
  const meta = STATUS_META[status];
  return (
    <Badge tone={meta.tone} className={cn(className)}>
      <StatusDot status={status} size={8} />
      {meta.label}
    </Badge>
  );
}

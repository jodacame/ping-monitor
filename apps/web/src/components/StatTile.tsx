import type { LucideIcon } from 'lucide-react';
import { Card } from './ui';

type Tone = 'primary' | 'up' | 'down' | 'warn' | 'neutral';

const TONE_VAR: Record<Tone, string> = {
  primary: 'var(--primary)',
  up: 'var(--up)',
  down: 'var(--down)',
  warn: 'var(--warn)',
  neutral: 'var(--muted)',
};

/** A single KPI tile: label, big value, tinted icon. */
export function StatTile({
  label,
  value,
  icon: Icon,
  tone = 'primary',
  hint,
  delay = 0,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  tone?: Tone;
  hint?: string;
  delay?: number;
}) {
  const color = TONE_VAR[tone];
  return (
    <Card
      className="animate-fade-up p-4 sm:p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted">{label}</span>
        <span
          className="grid h-8 w-8 place-items-center rounded-lg"
          style={{ background: `color-mix(in oklab, ${color} 14%, transparent)`, color }}
        >
          <Icon size={16} />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold tabular-nums tracking-tight text-fg">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </Card>
  );
}

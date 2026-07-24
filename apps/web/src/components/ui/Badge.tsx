import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

type Tone = 'neutral' | 'up' | 'down' | 'warn' | 'primary';

const TONES: Record<Tone, string> = {
  neutral: 'bg-elevated text-muted border-border',
  up: 'bg-up/10 text-up border-up/20',
  down: 'bg-down/10 text-down border-down/20',
  warn: 'bg-warn/10 text-warn border-warn/20',
  primary: 'bg-primary/10 text-primary border-primary/20',
};

/** Small pill for statuses, tags and counts. */
export function Badge({
  tone = 'neutral',
  children,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

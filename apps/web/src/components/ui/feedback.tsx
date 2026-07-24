import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/** Indeterminate spinner. */
export function Spinner({ size = 18, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={cn('animate-spin', className)}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="3" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Shimmering placeholder block for loading states. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('skeleton-shimmer relative overflow-hidden rounded-md bg-elevated', className)} />
  );
}

/** Centered empty/zero state with an optional call to action. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <div className="grid h-12 w-12 place-items-center rounded-full bg-elevated text-muted">
          {icon}
        </div>
      )}
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-fg">{title}</h3>
        {description && <p className="mx-auto max-w-sm text-sm text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

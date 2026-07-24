import { useId } from 'react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/cn';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

/** Segmented toggle with a spring-animated active pill (shared layout). */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const layoutId = useId();
  return (
    <div
      className={cn(
        'inline-flex items-center gap-0.5 rounded-lg border border-border bg-elevated p-0.5',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className="relative rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
          >
            {active && (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-surface shadow-sm"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className={cn('relative z-10', active ? 'text-fg' : 'text-muted hover:text-fg')}>
              {option.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

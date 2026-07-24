import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  interactive?: boolean;
}

/** Surface container. `interactive` adds a subtle hover lift for clickable cards. */
export function Card({ interactive, className, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-surface',
        interactive &&
          'cursor-pointer transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-lg hover:shadow-black/5',
        className,
      )}
      {...rest}
    />
  );
}

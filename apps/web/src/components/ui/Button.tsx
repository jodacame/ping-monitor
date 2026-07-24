import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { Spinner } from './feedback';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary:
    'bg-primary text-primary-fg hover:brightness-110 active:brightness-95 shadow-sm shadow-primary/20',
  secondary:
    'bg-elevated text-fg border border-border hover:bg-border/40 active:bg-border/60',
  ghost: 'text-muted hover:text-fg hover:bg-elevated active:bg-border/50',
  danger: 'bg-down text-white hover:brightness-110 active:brightness-95',
};

const SIZES: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-11 px-5 text-sm gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

/** The single button primitive used everywhere. Accessible, with loading state. */
export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  leadingIcon,
  trailingIcon,
  fullWidth,
  className,
  children,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-lg font-medium select-none',
        'transition-[filter,background-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        fullWidth && 'w-full',
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Spinner size={size === 'sm' ? 14 : 16} /> : leadingIcon}
      {children}
      {!loading && trailingIcon}
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: Variant;
  size?: Size;
}

/** A square, icon-only button. `label` is required for accessibility. */
export function IconButton({
  label,
  variant = 'ghost',
  size = 'md',
  className,
  children,
  ...rest
}: IconButtonProps) {
  const box = size === 'sm' ? 'h-8 w-8' : size === 'lg' ? 'h-11 w-11' : 'h-10 w-10';
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-lg transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
        'disabled:opacity-50 disabled:pointer-events-none',
        VARIANTS[variant],
        box,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

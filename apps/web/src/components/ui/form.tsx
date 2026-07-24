import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { cn } from '../../lib/cn';

const CONTROL =
  'w-full rounded-lg border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted/70 ' +
  'transition-[border-color,box-shadow] duration-150 ' +
  'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 ' +
  'disabled:opacity-60';

/** Labelled field wrapper with hint + error slots. */
export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label?: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
          {label}
        </label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-down">{error}</p>
      ) : hint ? (
        <p className="text-xs text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, 'h-10', className)} {...rest} />;
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(CONTROL, 'py-2', className)} {...rest} />;
}

export function Select({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, 'h-10 pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

import { useEffect, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

/**
 * Right-side slide-over. Full-width on mobile, panel-width on larger screens —
 * the workhorse of the "act without leaving the screen" UX. Closes on Escape
 * and backdrop click, and locks body scroll while open.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  widthClass = 'sm:max-w-xl',
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  widthClass?: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className={cn(
              'absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-2xl',
              'border-l border-border',
              widthClass,
            )}
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 40 }}
          >
            <header className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div className="min-w-0">
                {typeof title === 'string' ? (
                  <h2 className="truncate text-lg font-semibold text-fg">{title}</h2>
                ) : (
                  title
                )}
                {subtitle && <div className="mt-0.5 truncate text-sm text-muted">{subtitle}</div>}
              </div>
              <IconButton label="Close" onClick={onClose}>
                <X size={18} />
              </IconButton>
            </header>

            <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">{children}</div>

            {footer && (
              <footer className="border-t border-border bg-surface/80 px-5 py-4 backdrop-blur">
                {footer}
              </footer>
            )}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}

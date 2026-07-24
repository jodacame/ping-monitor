import { Radar } from 'lucide-react';
import { cn } from '../lib/cn';

/** The product wordmark + logo. Reused in the sidebar and auth screens. */
export function Brand({
  size = 'md',
  showText = true,
  className,
}: {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}) {
  const px = size === 'sm' ? 28 : size === 'lg' ? 44 : 34;
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div
        className="relative grid shrink-0 place-items-center rounded-xl text-white shadow-lg shadow-primary/25"
        style={{
          width: px,
          height: px,
          background:
            'linear-gradient(135deg, var(--primary), color-mix(in oklab, var(--primary) 55%, var(--up)))',
        }}
      >
        <Radar size={px * 0.56} strokeWidth={2.2} />
      </div>
      {showText && (
        <span className="text-[1.05rem] font-semibold tracking-tight text-fg">
          Ping<span className="text-primary">Monitor</span>
        </span>
      )}
    </div>
  );
}

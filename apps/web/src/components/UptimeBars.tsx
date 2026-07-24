import { formatUptime } from '../lib/format';

/** Colour a bar by its hourly up-ratio. */
function barColor(ratio: number | null): string {
  if (ratio === null) return 'var(--border)';
  if (ratio >= 0.999) return 'var(--up)';
  if (ratio >= 0.9) return 'var(--warn)';
  return 'var(--down)';
}

/**
 * A compact "heartbeat" of recent hourly health, right-aligned so the newest
 * bar is always on the right, with an optional uptime figure.
 */
export function UptimeBars({
  bars,
  uptime,
  max = 30,
  showValue = true,
}: {
  bars: Array<number | null>;
  uptime?: number | null;
  max?: number;
  showValue?: boolean;
}) {
  const recent = bars.slice(-max);
  const padded = [...Array<null>(Math.max(0, max - recent.length)).fill(null), ...recent];

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-6 items-stretch gap-[2px]" aria-hidden="true">
        {padded.map((ratio, i) => (
          <span
            key={i}
            title={ratio === null ? 'No data' : `${(ratio * 100).toFixed(1)}%`}
            className="w-[3px] rounded-full transition-colors"
            style={{ background: barColor(ratio), opacity: ratio === null ? 0.35 : 1 }}
          />
        ))}
      </div>
      {showValue && (
        <span className="w-14 text-right text-xs font-medium tabular-nums text-muted">
          {uptime === undefined ? '' : formatUptime(uptime)}
        </span>
      )}
    </div>
  );
}

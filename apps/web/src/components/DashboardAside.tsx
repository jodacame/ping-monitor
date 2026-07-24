import { AlertTriangle, CircleCheck, Radar, Zap } from 'lucide-react';
import type { Monitor, Overview, WorkspaceInsights } from '../lib/types';
import { formatLatency, formatRelativeTime, formatUptime, prettyTarget } from '../lib/format';
import { cn } from '../lib/cn';
import { Card, Skeleton, StatusDot } from './ui';

/** Health tone derived from the live status mix. */
function healthTone(overview: Overview): { color: string; label: string } {
  if (overview.total === 0) return { color: 'var(--muted)', label: 'No monitors yet' };
  if (overview.down > 0)
    return {
      color: 'var(--down)',
      label: `${overview.down} ${overview.down === 1 ? 'monitor' : 'monitors'} down`,
    };
  if (overview.up === 0 && overview.pending > 0)
    return { color: 'var(--warn)', label: 'Running first checks' };
  return { color: 'var(--up)', label: 'All systems operational' };
}

/** A 270° radial gauge showing 24h uptime, ringed in the current health colour. */
function UptimeGauge({ uptime, color }: { uptime: number | null; color: string }) {
  const fraction = uptime ?? 0;
  const visible = 75; // 270° of a pathLength=100 circle
  const value = fraction * visible;

  return (
    <div className="relative mx-auto h-40 w-40">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-[135deg]">
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke="var(--border)"
          strokeWidth="9"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${visible} ${100 - visible}`}
        />
        <circle
          cx="60"
          cy="60"
          r="52"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          pathLength={100}
          strokeDasharray={`${value} 100`}
          style={{
            transition: 'stroke-dasharray 0.9s cubic-bezier(0.22,1,0.36,1), stroke 0.4s',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-semibold tabular-nums text-fg">
          {uptime === null ? '—' : formatUptime(uptime)}
        </span>
        <span className="text-[11px] uppercase tracking-wide text-muted">uptime · 24h</span>
      </div>
    </div>
  );
}

function DistributionBar({ overview }: { overview: Overview }) {
  const total = Math.max(1, overview.total);
  const segs = [
    { key: 'up', value: overview.up, color: 'var(--up)' },
    { key: 'down', value: overview.down, color: 'var(--down)' },
    { key: 'paused', value: overview.paused + overview.pending, color: 'var(--pending)' },
  ].filter((s) => s.value > 0);

  return (
    <div className="flex h-2 w-full gap-[3px] overflow-hidden rounded-full">
      {segs.length === 0 ? (
        <div className="w-full bg-border" />
      ) : (
        segs.map((s) => (
          <div
            key={s.key}
            className="h-full rounded-full transition-[width] duration-500"
            style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
          />
        ))
      )}
    </div>
  );
}

function Legend({ overview }: { overview: Overview }) {
  const items = [
    { label: 'Up', value: overview.up, color: 'var(--up)' },
    { label: 'Down', value: overview.down, color: 'var(--down)' },
    { label: 'Paused', value: overview.paused + overview.pending, color: 'var(--pending)' },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: it.color }} />
          <span className="text-sm font-semibold tabular-nums text-fg">{it.value}</span>
          <span className="text-xs text-muted">{it.label}</span>
        </div>
      ))}
    </div>
  );
}

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Zap;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl bg-elevated/50 p-3">
      <div className="flex items-center gap-1.5 text-muted">
        <Icon size={13} />
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold tabular-nums text-fg">{value}</div>
    </div>
  );
}

/** The dashboard's right-hand operations cockpit. */
export function DashboardAside({
  overview,
  insights,
  monitors = [],
  onSelect,
  loading,
}: {
  overview?: Overview;
  insights?: WorkspaceInsights;
  monitors?: Monitor[];
  onSelect?: (m: Monitor) => void;
  loading?: boolean;
}) {
  if (loading || !overview || !insights) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-80" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const tone = healthTone(overview);
  const down = monitors.filter((m) => m.status === 'down');

  return (
    <div className="animate-fade-up space-y-4">
      <Card className="overflow-hidden">
        {/* Health header tinted by status */}
        <div
          className="flex items-center gap-2 px-5 py-3"
          style={{ background: `color-mix(in oklab, ${tone.color} 12%, transparent)` }}
        >
          <span className="relative flex h-2.5 w-2.5">
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: tone.color, animation: 'pulse-ring 2s cubic-bezier(0,0,0.2,1) infinite' }}
            />
            <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: tone.color }} />
          </span>
          <span className="text-sm font-medium" style={{ color: tone.color }}>
            {tone.label}
          </span>
        </div>

        <div className="space-y-5 p-5">
          <UptimeGauge uptime={insights.uptime} color={tone.color} />
          <DistributionBar overview={overview} />
          <Legend overview={overview} />

          <div className="grid grid-cols-3 gap-2 border-t border-border pt-4">
            <Metric icon={Zap} label="Avg response" value={formatLatency(insights.avgLatencyMs)} />
            <Metric icon={AlertTriangle} label="Incidents" value={String(insights.incidents24h)} />
            <Metric icon={Radar} label="Monitors" value={String(overview.total)} />
          </div>
        </div>
      </Card>

      {/* Actionable: what needs attention right now */}
      {down.length > 0 ? (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <AlertTriangle size={15} className="text-down" />
            <span className="text-sm font-semibold text-fg">Needs attention</span>
          </div>
          <div>
            {down.map((m) => (
              <button
                key={m.id}
                onClick={() => onSelect?.(m)}
                className="flex w-full items-center gap-3 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-elevated/60"
              >
                <StatusDot status="down" size={9} />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-fg">{m.name}</div>
                  <div className="truncate text-xs text-muted">{prettyTarget(m.target)}</div>
                </div>
                <span className="shrink-0 text-xs text-down">
                  {formatRelativeTime(m.lastStatusChangedAt)}
                </span>
              </button>
            ))}
          </div>
        </Card>
      ) : (
        <Card className={cn('flex items-center gap-3 p-4')}>
          <CircleCheck size={18} className="text-up" />
          <span className="text-sm text-muted">Everything is running smoothly.</span>
        </Card>
      )}
    </div>
  );
}

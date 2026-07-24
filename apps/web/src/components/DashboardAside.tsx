import { Activity, CircleCheck, ShieldAlert, TriangleAlert } from 'lucide-react';
import type { Overview, WorkspaceInsights } from '../lib/types';
import { formatLatency, formatUptime } from '../lib/format';
import { Card, Skeleton } from './ui';

function StatusPanel({ overview }: { overview: Overview }) {
  const anyDown = overview.down > 0;
  const checking = !anyDown && overview.pending > 0;
  const allUp = overview.total > 0 && overview.up === overview.total;

  const tone = anyDown ? 'var(--down)' : checking ? 'var(--warn)' : 'var(--up)';
  const Icon = anyDown ? TriangleAlert : checking ? Activity : CircleCheck;
  const headline = anyDown
    ? `${overview.down} ${overview.down === 1 ? 'monitor is' : 'monitors are'} down`
    : allUp
      ? 'All systems operational'
      : checking
        ? 'Running first checks'
        : 'No monitors yet';

  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold text-fg">Current status</h2>
      <div className="mt-4 flex flex-col items-center text-center">
        <div
          className="relative grid h-16 w-16 place-items-center rounded-full"
          style={{ background: `color-mix(in oklab, ${tone} 14%, transparent)`, color: tone }}
        >
          {!anyDown && !checking && overview.total > 0 && (
            <span
              className="absolute inset-0 rounded-full"
              style={{ background: tone, animation: 'pulse-ring 2s cubic-bezier(0,0,0.2,1) infinite' }}
            />
          )}
          <Icon size={26} className="relative" />
        </div>
        <p className="mt-3 text-sm font-medium text-fg">{headline}</p>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4 text-center">
        <Stat value={overview.down} label="Down" color="var(--down)" />
        <Stat value={overview.up} label="Up" color="var(--up)" />
        <Stat value={overview.paused + overview.pending} label="Paused" color="var(--muted)" />
      </div>
    </Card>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div>
      <div className="text-2xl font-semibold tabular-nums" style={{ color }}>
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
    </div>
  );
}

function InsightsPanel({ insights }: { insights: WorkspaceInsights }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-fg">Last 24 hours</h2>
        <ShieldAlert size={15} className="text-muted" />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Metric label="Overall uptime" value={formatUptime(insights.uptime)} highlight />
        <Metric label="Avg response" value={formatLatency(insights.avgLatencyMs)} />
        <Metric label="Incidents" value={String(insights.incidents24h)} />
      </div>
    </Card>
  );
}

function Metric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className={`text-xl font-semibold tabular-nums ${highlight ? 'text-up' : 'text-fg'}`}>
        {value}
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
    </div>
  );
}

/** The dashboard's right-hand summary column. */
export function DashboardAside({
  overview,
  insights,
  loading,
}: {
  overview?: Overview;
  insights?: WorkspaceInsights;
  loading?: boolean;
}) {
  if (loading || !overview || !insights) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-52" />
        <Skeleton className="h-40" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <StatusPanel overview={overview} />
      <InsightsPanel insights={insights} />
    </div>
  );
}

import { motion } from 'framer-motion';
import { Activity, ChevronRight, Globe, Network, Pause, Play } from 'lucide-react';
import type { Monitor, MonitorType } from '../lib/types';
import { formatLatency, formatRelativeTime, prettyTarget } from '../lib/format';
import { Badge, IconButton, StatusDot } from './ui';

const TYPE_META: Record<MonitorType, { label: string; icon: typeof Globe }> = {
  http: { label: 'HTTP', icon: Globe },
  tcp: { label: 'TCP', icon: Network },
  icmp: { label: 'Ping', icon: Activity },
};

function MonitorRow({
  monitor,
  onSelect,
  onTogglePause,
  index,
}: {
  monitor: Monitor;
  onSelect: (m: Monitor) => void;
  onTogglePause: (m: Monitor) => void;
  index: number;
}) {
  const type = TYPE_META[monitor.type];
  const paused = monitor.status === 'paused';

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.03, 0.3), duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      onClick={() => onSelect(monitor)}
      className="group flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3.5 transition-colors last:border-0 hover:bg-elevated/60 sm:gap-4 sm:px-5"
    >
      <StatusDot status={monitor.status} size={11} />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-fg">{monitor.name}</span>
          <Badge tone="neutral" className="hidden sm:inline-flex">
            <type.icon size={11} />
            {type.label}
          </Badge>
        </div>
        <div className="truncate text-xs text-muted">{prettyTarget(monitor.target)}</div>
      </div>

      {/* Latency */}
      <div className="hidden w-20 text-right sm:block">
        <div className="text-sm font-medium tabular-nums text-fg">
          {formatLatency(monitor.lastResponseMs)}
        </div>
        <div className="text-[11px] text-muted">latency</div>
      </div>

      {/* Last checked */}
      <div className="hidden w-24 text-right md:block">
        <div className="text-sm tabular-nums text-fg">{formatRelativeTime(monitor.lastCheckedAt)}</div>
        <div className="text-[11px] text-muted">checked</div>
      </div>

      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <IconButton
          label={paused ? 'Resume monitor' : 'Pause monitor'}
          size="sm"
          onClick={() => onTogglePause(monitor)}
          className="opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          {paused ? <Play size={15} /> : <Pause size={15} />}
        </IconButton>
        <ChevronRight size={16} className="text-muted transition-transform group-hover:translate-x-0.5" />
      </div>
    </motion.div>
  );
}

/** The monitors list. Rows on desktop, comfortable tap targets on mobile. */
export function MonitorList({
  monitors,
  onSelect,
  onTogglePause,
}: {
  monitors: Monitor[];
  onSelect: (m: Monitor) => void;
  onTogglePause: (m: Monitor) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      {monitors.map((m, i) => (
        <MonitorRow
          key={m.id}
          monitor={m}
          index={i}
          onSelect={onSelect}
          onTogglePause={onTogglePause}
        />
      ))}
    </div>
  );
}

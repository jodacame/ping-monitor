import { useEffect, useRef } from 'react';
import uPlot from 'uplot';
import 'uplot/dist/uPlot.min.css';
import type { SeriesPoint } from '../lib/types';
import { formatLatency } from '../lib/format';

/**
 * Latency over time — a single-series area+line chart (uPlot).
 *
 * Following the dataviz method: one series ⇒ no legend (the heading names it),
 * one y-axis, recessive grid/axes, a crosshair + tooltip hover layer, and colors
 * read from the theme tokens so it looks native in both light and dark modes.
 */
function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function tooltipPlugin(): uPlot.Plugin {
  let tip: HTMLDivElement | null = null;
  return {
    hooks: {
      init: (u) => {
        tip = document.createElement('div');
        tip.className =
          'pointer-events-none absolute z-10 hidden rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg';
        u.over.appendChild(tip);
      },
      setCursor: (u) => {
        if (!tip) return;
        const idx = u.cursor.idx;
        if (idx === null || idx === undefined) {
          tip.style.display = 'none';
          return;
        }
        const x = u.data[0]?.[idx];
        const y = u.data[1]?.[idx];
        if (x === undefined || y === null || y === undefined) {
          tip.style.display = 'none';
          return;
        }
        const time = new Date((x) * 1000).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
        tip.innerHTML =
          `<div class="text-muted">${time}</div>` +
          `<div class="font-semibold text-fg">${formatLatency(y)}</div>`;
        tip.style.display = 'block';
        const left = u.valToPos(x, 'x');
        const top = u.valToPos(y, 'y');
        tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px) translate(-50%, -130%)`;
      },
    },
  };
}

export function LatencyChart({
  series,
  height = 220,
  from,
  to,
}: {
  series: SeriesPoint[];
  height?: number;
  /** Window bounds (epoch ms). Fixes the x-axis span even with sparse data. */
  from?: number;
  to?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const primary = readVar('--primary') || '#6366f1';
    const muted = readVar('--muted') || '#8b98ad';
    const border = readVar('--border') || '#1e2637';

    const xs = series.map((p) => new Date(p.bucket).getTime() / 1000);
    const ys = series.map((p) => p.avgLatencyMs);
    const data: uPlot.AlignedData = [xs, ys];

    const opts: uPlot.Options = {
      width: el.clientWidth || 600,
      height,
      padding: [14, 8, 0, 8],
      cursor: { y: false, points: { size: 7, width: 2, stroke: primary, fill: primary } },
      legend: { show: false },
      scales: {
        x: {
          time: true,
          ...(from && to ? { range: () => [from / 1000, to / 1000] as [number, number] } : {}),
        },
        y: { range: (_u, _min, max) => [0, Math.max(10, max * 1.15)] },
      },
      axes: [
        {
          stroke: muted,
          grid: { show: false },
          ticks: { show: false },
          font: '11px Inter, system-ui, sans-serif',
        },
        {
          stroke: muted,
          size: 46,
          grid: { stroke: border, width: 1 },
          ticks: { show: false },
          font: '11px Inter, system-ui, sans-serif',
          values: (_u, vals) => vals.map((v) => `${v}`),
        },
      ],
      series: [
        {},
        {
          label: 'Latency',
          stroke: primary,
          width: 2,
          points: { show: false },
          fill: (u) => {
            const ctx = u.ctx;
            const grad = ctx.createLinearGradient(0, u.bbox.top, 0, u.bbox.top + u.bbox.height);
            grad.addColorStop(0, `color-mix(in oklab, ${primary} 34%, transparent)`);
            grad.addColorStop(1, `color-mix(in oklab, ${primary} 2%, transparent)`);
            return grad;
          },
        },
      ],
      plugins: [tooltipPlugin()],
    };

    plot.current = new uPlot(opts, data, el);
    const ro = new ResizeObserver(() => {
      if (plot.current) plot.current.setSize({ width: el.clientWidth, height });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      plot.current?.destroy();
      plot.current = null;
    };
  }, [series, height, from, to]);

  return <div ref={ref} className="w-full" />;
}

import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CircleCheck, TriangleAlert } from 'lucide-react';
import { api } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { Brand } from '../components/Brand';
import { UptimeBars } from '../components/UptimeBars';
import { Card, Spinner, StatusBadge } from '../components/ui';

export function StatusPublicPage() {
  const { slug = '' } = useParams();
  const query = useQuery({
    queryKey: ['public-status', slug],
    queryFn: () => api.publicStatus(slug),
    refetchInterval: 30_000,
    retry: false,
  });

  const page = query.data;
  const anyDown = page?.monitors.some((m) => m.status === 'down') ?? false;
  const allOperational = Boolean(page && page.monitors.every((m) => m.status === 'up'));

  return (
    <div className="min-h-full bg-bg">
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-16">
        {query.isLoading ? (
          <div className="grid place-items-center py-24 text-muted">
            <Spinner size={26} />
          </div>
        ) : !page ? (
          <div className="py-24 text-center">
            <h1 className="text-xl font-semibold text-fg">Status page not found</h1>
            <p className="mt-2 text-sm text-muted">Check the link and try again.</p>
          </div>
        ) : (
          <>
            <header className="mb-8 text-center">
              <h1 className="text-2xl font-semibold tracking-tight text-fg">{page.title}</h1>
              {page.description && <p className="mt-1.5 text-muted">{page.description}</p>}
            </header>

            {/* Overall banner */}
            <div
              className="mb-6 flex items-center gap-3 rounded-xl border p-4"
              style={{
                borderColor: `color-mix(in oklab, ${anyDown ? 'var(--down)' : 'var(--up)'} 30%, transparent)`,
                background: `color-mix(in oklab, ${anyDown ? 'var(--down)' : 'var(--up)'} 8%, transparent)`,
              }}
            >
              {anyDown ? (
                <TriangleAlert className="text-down" size={22} />
              ) : (
                <CircleCheck className="text-up" size={22} />
              )}
              <span className="text-base font-medium text-fg">
                {anyDown
                  ? 'Some systems are experiencing issues'
                  : allOperational
                    ? 'All systems operational'
                    : 'Monitoring services'}
              </span>
            </div>

            {/* Monitors */}
            <Card className="divide-y divide-border">
              {page.monitors.map((m, i) => (
                <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3.5 sm:px-5">
                  <span className="flex-1 truncate font-medium text-fg">{m.name}</span>
                  <div className="hidden sm:block">
                    <UptimeBars bars={m.bars} uptime={m.uptime24h} max={24} />
                  </div>
                  <StatusBadge status={m.status} />
                </div>
              ))}
              {page.monitors.length === 0 && (
                <div className="px-5 py-8 text-center text-sm text-muted">
                  No monitors on this page yet.
                </div>
              )}
            </Card>

            <footer className="mt-8 flex items-center justify-between text-xs text-muted">
              <span>Updated {formatDateTime(page.updatedAt)}</span>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 opacity-70 transition-opacity hover:opacity-100"
              >
                <Brand size="sm" />
              </a>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

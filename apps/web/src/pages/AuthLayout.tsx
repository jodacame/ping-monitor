import type { ReactNode } from 'react';
import { Activity, BellRing, Globe2, ShieldCheck } from 'lucide-react';
import { Brand } from '../components/Brand';

const HIGHLIGHTS = [
  { icon: Globe2, title: 'Global checks', text: 'Probe from many regions and confirm outages by quorum.' },
  { icon: Activity, title: 'Live latency', text: 'See response time and uptime at a glance, always fresh.' },
  { icon: BellRing, title: 'Instant alerts', text: 'Know the moment something goes down — email, Telegram, more.' },
  { icon: ShieldCheck, title: 'SSL & more', text: 'HTTP, TCP, ping and certificate expiry, all in one place.' },
];

/** Two-pane auth shell: form on the left, aspirational hero on the right. */
export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-full lg:grid-cols-2">
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm animate-fade-up">
          <Brand size="lg" />
          <h1 className="mt-8 text-2xl font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1.5 text-sm text-muted">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
        </div>
      </div>

      <div className="relative hidden overflow-hidden border-l border-border bg-elevated lg:block">
        <div className="ambient-glow absolute inset-0" />
        <div className="absolute -right-24 top-1/3 h-72 w-72 rounded-full bg-primary/20 blur-3xl [animation:float-glow_9s_ease-in-out_infinite]" />
        <div className="relative flex h-full flex-col justify-center px-14 xl:px-20">
          <h2 className="max-w-md text-3xl font-semibold leading-tight tracking-tight text-fg">
            Know your services are online — before your customers do.
          </h2>
          <p className="mt-4 max-w-md text-muted">
            Beautiful, self-hosted uptime monitoring built to scale from one site to millions.
          </p>
          <div className="mt-10 grid max-w-lg grid-cols-1 gap-4 sm:grid-cols-2">
            {HIGHLIGHTS.map((h) => (
              <div
                key={h.title}
                className="rounded-xl border border-border bg-surface/60 p-4 backdrop-blur"
              >
                <h.icon className="text-primary" size={20} />
                <div className="mt-2.5 text-sm font-medium text-fg">{h.title}</div>
                <div className="mt-1 text-xs leading-relaxed text-muted">{h.text}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

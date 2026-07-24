# Ping Monitor

Self-hosted, horizontally-scalable **uptime monitoring** — HTTP/HTTPS, TCP and ICMP
checks with global probes, retries, incident history, statistics and a beautiful
dashboard. Built to grow from one site to millions on plain PostgreSQL, Redis and
Node.js.

> Status: **early foundation.** The end-to-end monitoring pipeline (schedule →
> check → persist → roll up → detect incidents → emit events) and the dashboard
> are working. Alerting connectors, TCP/ICMP executors, SSL monitoring, status
> pages and CSV export are on the [roadmap](#roadmap).

## Highlights

- **Global monitoring.** Deploy workers in multiple regions; each check is
  scheduled per `(monitor, region)` and results are stored per region. A
  monitor's overall status is decided by **quorum** (down only when *K* regions
  agree), so a single bad vantage point never triggers a false alarm.
- **Compact, scalable storage — no extensions.** The hot `check_results` table is
  **range-partitioned by day** (native PostgreSQL, no `pg_partman`/TimescaleDB
  required), pruned by dropping old partitions. Long-term history lives in tiny
  pre-aggregated hourly/daily **rollups** plus an `incidents` table.
- **Event-driven & horizontally scalable.** A scheduler enqueues due checks onto
  per-region **Redis Streams**; any number of stateless **workers** consume them.
  Status changes are published on a domain **event bus** for independent
  consumers (alerting, webhooks, analytics).
- **Anti-false-positive retries.** A pure, unit-tested state machine flips a
  monitor only after N consecutive failures, and recovers after M successes.
- **A dashboard people actually enjoy.** React + Vite, light/dark, fully
  responsive (mobile-first), with an "act without leaving the screen" drawer UX.

## Architecture

```
                        ┌───────────────┐
      REST / SPA  ──────▶     API       │  auth · workspaces · monitors · stats
                        └──────┬────────┘
                               │ Postgres
      ┌───────────────┐        ▼
      │   Scheduler   │──▶ claims due (monitor, region) assignments
      └──────┬────────┘        │  (FOR UPDATE SKIP LOCKED)
             │ enqueue         ▼
        Redis Stream  ┌──────────────────┐   Postgres
   checks:pending:R ──▶      Worker(s)   │──▶ check_results (partitioned)
                        │  region = R    │──▶ hourly / daily rollups
                        └──────┬─────────┘──▶ incidents
                               │ publish
                        events:monitor ─────▶ (notifier · webhooks · …)
```

Monorepo layout:

```
packages/
  core           domain kernel: types, retry state machine, events, errors (pure)
  config         typed env loaders + structured logger (pino)
  db             schema (SQL migrations), compact codecs, repositories
  queue          Redis Streams: per-region check queue + event bus
  checks         probe executors (Strategy): HTTP today, TCP/ICMP next
apps/
  api            Fastify REST API
  scheduler      enqueues due checks; maintains partitions & retention
  worker         executes checks, persists results, evaluates status, emits events
  web            React + Vite dashboard
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the data model and scaling
notes.

## Quick start (Docker)

Requirements: Docker + Docker Compose.

```bash
cp .env.example .env
# edit .env: set a strong JWT_SECRET (openssl rand -base64 48)

docker compose up -d --build
# dashboard:  http://localhost:8080
```

Scale probes horizontally:

```bash
docker compose up -d --scale worker=3
```

The bundle runs its own PostgreSQL and Redis. To run multi-region, deploy extra
`worker` containers on hosts in other regions with a distinct `PROBE_REGION`
(after adding the region to the `probe_regions` table), all pointing at the same
Postgres and Redis.

## Development

The stack is TypeScript end to end and runs on Node 26 with **pnpm**.

```bash
pnpm install
pnpm --filter @ping/db run migrate    # apply schema
pnpm dev:api                          # API      (:3000)
pnpm dev:scheduler                    # scheduler
pnpm dev:worker                       # worker
pnpm dev:web                          # dashboard (:5173, proxies /api)
```

Quality gates:

```bash
pnpm typecheck    # strict TS across the whole repo
pnpm test         # vitest
pnpm lint         # eslint (typed)
```

Configuration is entirely via environment variables — see
[`.env.example`](.env.example) for every option (pool sizes, intervals, worker
concurrency, retention windows, …).

## Roadmap

- [x] Alerting connectors (SMTP, Telegram, generic webhook) consuming the event bus
- [x] HTTP health assertions (status / body / JSON path / header / latency, AND/OR)
- [x] One-level monitor groups (folders)
- [x] TCP and ICMP check executors
- [x] SSL certificate expiry monitoring
- [x] Public status pages
- [x] Tags & filtering
- [x] CSV export of check history
- [ ] Per-region latency/uptime breakdown in the UI
- [ ] Multi-region worker deployment guide

## Contributing

Contributions are welcome — see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE) © jodacame and Ping Monitor contributors.

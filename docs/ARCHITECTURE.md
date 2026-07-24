# Architecture & data model

This document explains the moving parts, the storage design, and how the system
is meant to scale. It complements the high-level diagram in the [README](../README.md).

## Principles

- **SOLID, layered, testable.** Pure domain logic (`@ping/core`) has no I/O and is
  unit-tested. Repositories depend on a `Queryable` interface, so they compose
  with transactions and are trivial to fake. Probe types are a Strategy
  (`CheckExecutor`); adding TCP/ICMP means adding a class, not editing callers.
- **Event-driven.** Producers never know their consumers. Checks flow over Redis
  Streams; status changes are published on a domain event bus.
- **Portable.** Vanilla PostgreSQL only — no extensions — so anyone can self-host
  on any managed or local Postgres.

## Request & check lifecycle

1. **API** creates a monitor and one `monitor_assignments` row per selected
   region (the schedulable unit).
2. **Scheduler** every tick atomically claims due assignments with
   `FOR UPDATE SKIP LOCKED`, advancing each `next_check_at` by the monitor's
   interval, and enqueues a compact job onto that region's Redis Stream. Safe to
   run in multiple replicas — no assignment is handed out twice.
3. **Worker** (bound to one region) consumes its stream via a consumer group,
   executes the probe, and:
   - buffers the raw result and rollup deltas in memory (flushed in batches);
   - in one transaction, applies the **per-region** retry state machine, then
     recomputes the **overall** status by quorum, opening/resolving an incident
     on transition;
   - publishes a `MonitorStatusChanged` event when the overall status flips.
4. **Consumers** of the event bus (alerting, webhooks, …) react independently.

## Data model

Compact by design: enums are stored as `SMALLINT` codecs (see
`packages/db/src/codecs.ts`), ids are `BIGINT` internally with ULID `public_id`s
exposed externally.

| Table | Purpose | Notes |
|-------|---------|-------|
| `users`, `workspaces`, `workspace_members`, `refresh_tokens` | auth & tenancy | rotating refresh tokens stored as SHA-256 hashes |
| `probe_regions`, `probes` | global monitoring | regions are compact SMALLINT ids; probes heartbeat |
| `monitors` | monitor config + derived overall status | |
| `monitor_assignments` | **schedulable unit** per `(monitor, region)` | holds per-region health + `next_check_at`; partial index on due, enabled rows |
| `check_results` | raw per-check time series | **RANGE-partitioned by day**; no FK (write throughput) |
| `monitor_stats_hourly` / `_daily` | pre-aggregated rollups | `sum/count/min/max` per `(monitor, region, bucket)` |
| `incidents` | outage history | one row per overall-DOWN period; at most one open per monitor |

### Partitioning & retention (no extensions)

`check_results` is a partitioned parent; plpgsql helpers manage daily children:

- `ensure_check_partitions(days_ahead)` — pre-creates upcoming partitions.
- `drop_check_partitions_before(cutoff)` — retention as a cheap `DROP TABLE`
  instead of a mass `DELETE`.

The scheduler runs these on an hourly maintenance timer (`RAW_RETENTION_DAYS`).
Averages are reconstructed from rollups as `latency_sum / latency_count`;
min/max merge across flushes via `LEAST`/`GREATEST` (which ignore NULLs).

### Why this scales

- The hot path is an **append** to a small daily partition plus **incremental
  upserts** to bounded rollup rows — no unbounded scans.
- Old raw data disappears by dropping partitions (O(1)), while long-term
  history stays in tiny rollups and the incident log.
- Workers are stateless and shard by region via Redis consumer groups; add
  workers to add throughput. The scheduler is replica-safe via `SKIP LOCKED`.

**Scaling knobs:** `PGPOOL_MAX`, `WORKER_CONCURRENCY`, `SCHEDULER_BATCH_SIZE`,
`RESULT_FLUSH_*`, retention windows. At extreme scale the same schema maps
cleanly onto `pg_partman`, Citus, or a dedicated columnar store for
`check_results` — the table DDL does not change.

## Multi-region deployment

Ping Monitor can probe your targets from several locations (e.g. Europe, US, Asia)
and decide the overall status by **quorum**. The design is deliberately simple:

- **The core stack is central and single-homed** — PostgreSQL, Redis, the API,
  the scheduler and the notifier all run in one place.
- **Only workers are distributed.** A "region" is a label plus a dedicated Redis
  Stream. A worker is pinned to one region via `PROBE_REGION`, connects back to
  the central Postgres and Redis, and consumes only that region's stream
  (`checks:pending:<regionId>`). The central scheduler routes each due check to the
  right region's stream, so a worker in Frankfurt runs the checks assigned to
  `eu-west`, a worker in Virginia runs `us-east`, and so on.

```
                    [ Postgres + Redis + API + Scheduler + Notifier ]   (central core)
                         ▲                 │                 ▲
              results +  │        checks:pending:2 / :3      │  results +
              heartbeat  │                 │                 │  heartbeat
                    ┌────┴─────┐     ┌──────┴─────┐    ┌──────┴─────┐
                    │ worker   │     │ worker(s)  │    │ worker(s)  │
                    │ local(1) │     │ eu-west(2) │    │ us-east(3) │
                    └──────────┘     └────────────┘    └────────────┘
                     data center        VPS in EU         VPS in US
```

### 1. Register the region

Regions live in `probe_regions` (a compact `SMALLINT` id referenced by the hot
tables). The schema ships with a default `(1, 'local')`. Add one row per region —
today this is a SQL insert (there is no region-admin API yet):

```sql
INSERT INTO probe_regions (id, code, name, enabled) VALUES
  (2, 'eu-west', 'Europe (Frankfurt)', true),
  (3, 'us-east', 'US East (Virginia)', true);
```

Pick a stable, unique `id` and a `code` you will use as `PROBE_REGION`. Set
`enabled = false` to temporarily park a region (its workers refuse to start).

### 2. Assign monitors to the region

A monitor is only checked from the regions it is assigned to. When creating or
editing a monitor, include the region ids in `regionIds` (this materialises one
`monitor_assignments` row per region). Set the monitor's **quorum** to how many
regions must agree it is down before the overall status flips — e.g. `quorum = 2`
across 3 regions tolerates one region's local network blip or a regional outage on
the probe side.

### 3. Deploy a worker in that region

Run a worker on a host **located in** that region, pointing at the central Postgres
and Redis. The only region-specific setting is `PROBE_REGION`:

```bash
docker run -d --name worker-eu --restart unless-stopped \
  -e PROBE_REGION=eu-west \
  -e DATABASE_URL="postgresql://ping_monitor:***@core-host:5432/ping_monitor" \
  -e REDIS_URL="redis://core-host:6379" \
  -e JWT_SECRET="<same as core>" \
  ping-monitor-worker
```

Or as a Compose file on the remote host (workers are the only service that runs
there):

```yaml
services:
  worker-eu:
    image: ping-monitor-worker
    command: ['pnpm', '--filter', '@ping/worker', 'run', 'start']
    environment:
      PROBE_REGION: eu-west
      DATABASE_URL: postgresql://ping_monitor:***@core-host:5432/ping_monitor
      REDIS_URL: redis://core-host:6379
    restart: unless-stopped
```

On boot the worker resolves its region (`Unknown probe region "…"` if it is not in
`probe_regions`, `disabled` if parked) and logs `worker online { region: 'eu-west' }`.

### Scaling and operating regions

- **Scale a region horizontally**: run several workers with the same
  `PROBE_REGION`. They share the `workers` consumer group and load-balance that
  region's stream via `XREADGROUP` — no extra configuration. Tune throughput per
  worker with `WORKER_CONCURRENCY`.
- **Observe liveness**: every worker upserts a heartbeat into `probes`
  (`region_id`, `instance = hostname:pid`, `version`, `last_heartbeat_at`). Query
  it to see which workers are alive where.
- **Networking & security**: remote workers must reach the central Redis and
  Postgres, which **must not be exposed to the public internet** (see
  [SECURITY](../SECURITY.md)). Connect regions over a **private network, VPN, or
  TLS tunnel**; restrict the database and Redis to those peers.
- **Latency semantics**: `response_ms` is measured from the probing worker, so the
  same monitor legitimately reports different latencies per region — that is the
  point. Per-region breakdown in the UI is on the roadmap.

## Security notes

- Passwords hashed with scrypt (memory-hard, no native dependency).
- Access tokens are short-lived JWTs; refresh tokens are opaque, hashed at rest,
  and rotated on every use.
- The API maps a typed error hierarchy to consistent JSON envelopes and never
  leaks internals on 500s.

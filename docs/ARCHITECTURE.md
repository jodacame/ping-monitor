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

## Security notes

- Passwords hashed with scrypt (memory-hard, no native dependency).
- Access tokens are short-lived JWTs; refresh tokens are opaque, hashed at rest,
  and rotated on every use.
- The API maps a typed error hierarchy to consistent JSON envelopes and never
  leaks internals on 500s.

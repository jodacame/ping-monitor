-- ============================================================================
-- 0001_init — core schema
--
-- Design goals:
--   * Compact storage: narrow integer types; status/type/error encoded as
--     SMALLINT codecs (see @ping/db/src/codecs.ts).
--   * Scale: the hot append-only `check_results` table is RANGE-partitioned by
--     day; old partitions are dropped (retention) instead of costly DELETEs.
--   * Global monitoring: probes run in many regions. The schedulable unit is a
--     (monitor, region) "assignment"; results, rollups and per-region health are
--     all keyed by region. Overall monitor status is derived from a quorum of
--     regions (anti-false-positive for a single bad vantage point).
--   * Long-term history without scanning raw rows: pre-aggregated hourly/daily
--     rollups plus an `incidents` table recording every outage.
--   * No PostgreSQL extensions required (portable to any vanilla Postgres).
-- ============================================================================

-- Auto-maintain updated_at columns.
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Identity & tenancy
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            BIGSERIAL   PRIMARY KEY,
  public_id     TEXT        NOT NULL UNIQUE,
  email         TEXT        NOT NULL UNIQUE,     -- stored lowercased by the app
  password_hash TEXT        NOT NULL,
  name          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE workspaces (
  id         BIGSERIAL   PRIMARY KEY,
  public_id  TEXT        NOT NULL UNIQUE,
  name       TEXT        NOT NULL,
  slug       TEXT        NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER workspaces_set_updated_at BEFORE UPDATE ON workspaces
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Membership + role (role codec: 0 owner, 1 admin, 2 member, 3 viewer).
CREATE TABLE workspace_members (
  workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role         SMALLINT    NOT NULL DEFAULT 2,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX workspace_members_user_idx ON workspace_members(user_id);

-- Rotating refresh tokens (only the SHA-256 hash is stored).
CREATE TABLE refresh_tokens (
  id         BIGSERIAL   PRIMARY KEY,
  user_id    BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT        NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens(user_id);

-- ---------------------------------------------------------------------------
-- Probe regions & instances (global monitoring)
--   Regions are few and stable; ids are compact SMALLINTs referenced by hot
--   tables. Probes are individual worker processes reporting a heartbeat.
-- ---------------------------------------------------------------------------

CREATE TABLE probe_regions (
  id         SMALLINT    PRIMARY KEY,
  code       TEXT        NOT NULL UNIQUE,        -- e.g. 'us-east-1', 'eu-west-1'
  name       TEXT        NOT NULL,
  enabled    BOOLEAN     NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A default region so a single-node deployment works out of the box.
INSERT INTO probe_regions (id, code, name) VALUES (1, 'local', 'Local / Default');

CREATE TABLE probes (
  id                BIGSERIAL   PRIMARY KEY,
  region_id         SMALLINT    NOT NULL REFERENCES probe_regions(id),
  instance          TEXT        NOT NULL,        -- hostname / container id
  version           TEXT,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (region_id, instance)
);

-- ---------------------------------------------------------------------------
-- Tags
-- ---------------------------------------------------------------------------

CREATE TABLE tags (
  id           BIGSERIAL   PRIMARY KEY,
  workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  color        TEXT        NOT NULL DEFAULT '#64748b',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, name)
);

-- ---------------------------------------------------------------------------
-- Monitors
--   type   codec: 0 http, 1 tcp, 2 icmp
--   status codec: 0 down, 1 up, 2 paused, 3 pending  (OVERALL, quorum-derived)
--   Per-region runtime state lives in monitor_assignments.
-- ---------------------------------------------------------------------------

CREATE TABLE monitors (
  id                     BIGSERIAL   PRIMARY KEY,
  public_id              TEXT        NOT NULL UNIQUE,
  workspace_id           BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name                   TEXT        NOT NULL,
  type                   SMALLINT    NOT NULL,
  target                 TEXT        NOT NULL,
  config                 JSONB       NOT NULL DEFAULT '{}'::jsonb,
  interval_seconds       SMALLINT    NOT NULL DEFAULT 60,
  timeout_ms             INTEGER     NOT NULL DEFAULT 10000,
  failure_threshold      SMALLINT    NOT NULL DEFAULT 3,   -- per region, before DOWN
  recovery_threshold     SMALLINT    NOT NULL DEFAULT 1,   -- per region, before UP
  quorum                 SMALLINT    NOT NULL DEFAULT 1,   -- regions that must agree DOWN
  enabled                BOOLEAN     NOT NULL DEFAULT true,
  status                 SMALLINT    NOT NULL DEFAULT 3,   -- overall (derived)
  last_checked_at        TIMESTAMPTZ,
  last_status_changed_at TIMESTAMPTZ,
  last_response_ms       INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TRIGGER monitors_set_updated_at BEFORE UPDATE ON monitors
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX monitors_workspace_idx ON monitors (workspace_id);
CREATE INDEX monitors_workspace_status_idx ON monitors (workspace_id, status);

CREATE TABLE monitor_tags (
  monitor_id BIGINT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  tag_id     BIGINT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (monitor_id, tag_id)
);
CREATE INDEX monitor_tags_tag_idx ON monitor_tags (tag_id);

-- The schedulable unit: one row per (monitor, region). Holds per-region runtime
-- health and the next_check_at scheduling key.
--   status codec (per region): 0 down, 1 up, 3 pending
CREATE TABLE monitor_assignments (
  monitor_id            BIGINT      NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  region_id             SMALLINT    NOT NULL REFERENCES probe_regions(id),
  enabled               BOOLEAN     NOT NULL DEFAULT true,  -- mirrors monitor.enabled
  status                SMALLINT    NOT NULL DEFAULT 3,
  consecutive_failures  SMALLINT    NOT NULL DEFAULT 0,
  consecutive_successes SMALLINT    NOT NULL DEFAULT 0,
  last_checked_at       TIMESTAMPTZ,
  last_response_ms      INTEGER,
  next_check_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (monitor_id, region_id)
);

-- Scheduler hot path: claim due, enabled assignments ordered by next_check_at.
CREATE INDEX monitor_assignments_due_idx
  ON monitor_assignments (region_id, next_check_at) WHERE enabled;

-- ---------------------------------------------------------------------------
-- check_results — hot, append-only, RANGE-partitioned by day.
--   error_kind codec: 0 timeout, 1 dns, 2 connection, 3 tls,
--                     4 http_status, 5 protocol, 6 unknown
--   No foreign key by design: this table receives the highest write volume and
--   we avoid per-row FK checks. Referential integrity is enforced in the app.
-- ---------------------------------------------------------------------------

CREATE TABLE check_results (
  monitor_id  BIGINT      NOT NULL,
  region_id   SMALLINT    NOT NULL,
  checked_at  TIMESTAMPTZ NOT NULL,
  up          BOOLEAN     NOT NULL,
  response_ms INTEGER,
  status_code SMALLINT,
  error_kind  SMALLINT
) PARTITION BY RANGE (checked_at);

-- Propagates to every partition; powers "last N checks for a monitor/region".
CREATE INDEX check_results_monitor_time_idx
  ON check_results (monitor_id, checked_at DESC);

-- Create (idempotently) the daily partition covering [day, day+1) in UTC.
CREATE OR REPLACE FUNCTION create_check_results_partition(p_day date)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  part_name text := 'check_results_' || to_char(p_day, 'YYYYMMDD');
  start_lit text := to_char(p_day, 'YYYY-MM-DD') || ' 00:00:00+00';
  end_lit   text := to_char(p_day + 1, 'YYYY-MM-DD') || ' 00:00:00+00';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = part_name) THEN
    EXECUTE format(
      'CREATE TABLE %I PARTITION OF check_results FOR VALUES FROM (%L) TO (%L)',
      part_name, start_lit, end_lit);
  END IF;
END;
$$;

-- Ensure partitions exist for today .. today + p_days_ahead (UTC).
CREATE OR REPLACE FUNCTION ensure_check_partitions(p_days_ahead int DEFAULT 2)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE d int;
BEGIN
  FOR d IN 0..p_days_ahead LOOP
    PERFORM create_check_results_partition(((now() AT TIME ZONE 'UTC')::date) + d);
  END LOOP;
END;
$$;

-- Retention: drop whole day-partitions older than the cutoff (cheap vs DELETE).
CREATE OR REPLACE FUNCTION drop_check_partitions_before(p_cutoff date)
RETURNS SETOF text LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_inherits i
    JOIN pg_class c ON c.oid = i.inhrelid
    JOIN pg_class p ON p.oid = i.inhparent
    WHERE p.relname = 'check_results'
      AND c.relname ~ '^check_results_[0-9]{8}$'
      AND to_date(right(c.relname, 8), 'YYYYMMDD') < p_cutoff
  LOOP
    EXECUTE format('DROP TABLE IF EXISTS %I', r.relname);
    RETURN NEXT r.relname;
  END LOOP;
END;
$$;

-- Seed initial partitions (today + next 3 days).
SELECT ensure_check_partitions(3);

-- ---------------------------------------------------------------------------
-- Rollups — pre-aggregated per (monitor, region, bucket).
--   Averages are reconstructed as latency_sum / latency_count.
--   Aggregate across regions for a global view, or filter by region.
-- ---------------------------------------------------------------------------

CREATE TABLE monitor_stats_hourly (
  monitor_id    BIGINT      NOT NULL,
  region_id     SMALLINT    NOT NULL,
  bucket        TIMESTAMPTZ NOT NULL,          -- truncated to the hour (UTC)
  checks_total  INTEGER     NOT NULL DEFAULT 0,
  checks_up     INTEGER     NOT NULL DEFAULT 0,
  latency_sum   BIGINT      NOT NULL DEFAULT 0,
  latency_count INTEGER     NOT NULL DEFAULT 0,
  latency_min   INTEGER,
  latency_max   INTEGER,
  PRIMARY KEY (monitor_id, region_id, bucket)
);
CREATE INDEX monitor_stats_hourly_bucket_idx ON monitor_stats_hourly (bucket);

CREATE TABLE monitor_stats_daily (
  monitor_id    BIGINT   NOT NULL,
  region_id     SMALLINT NOT NULL,
  bucket        DATE     NOT NULL,             -- UTC day
  checks_total  INTEGER  NOT NULL DEFAULT 0,
  checks_up     INTEGER  NOT NULL DEFAULT 0,
  latency_sum   BIGINT   NOT NULL DEFAULT 0,
  latency_count INTEGER  NOT NULL DEFAULT 0,
  latency_min   INTEGER,
  latency_max   INTEGER,
  PRIMARY KEY (monitor_id, region_id, bucket)
);

-- ---------------------------------------------------------------------------
-- Incidents — compact, permanent outage history (one row per OVERALL DOWN
-- period, decided by quorum). cause codec = check_results.error_kind.
-- ---------------------------------------------------------------------------

CREATE TABLE incidents (
  id               BIGSERIAL   PRIMARY KEY,
  public_id        TEXT        NOT NULL UNIQUE,
  monitor_id       BIGINT      NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at       TIMESTAMPTZ NOT NULL,
  resolved_at      TIMESTAMPTZ,
  duration_seconds INTEGER,
  cause            SMALLINT,
  cause_message    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX incidents_monitor_idx ON incidents (monitor_id, started_at DESC);
-- At most one open (unresolved) incident per monitor.
CREATE UNIQUE INDEX incidents_one_open_per_monitor
  ON incidents (monitor_id) WHERE resolved_at IS NULL;

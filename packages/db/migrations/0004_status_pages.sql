-- ============================================================================
-- 0004_status_pages — public status pages
--
-- A status page is a workspace-owned, publicly readable page (by slug) that
-- lists a chosen set of monitors and their live status. No auth is required to
-- read it; only the monitor name and status are exposed publicly.
-- ============================================================================

CREATE TABLE status_pages (
  id           BIGSERIAL   PRIMARY KEY,
  public_id    TEXT        NOT NULL UNIQUE,
  workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  slug         TEXT        NOT NULL UNIQUE,
  title        TEXT        NOT NULL,
  description  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX status_pages_workspace_idx ON status_pages (workspace_id);
CREATE TRIGGER status_pages_set_updated_at BEFORE UPDATE ON status_pages
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE status_page_monitors (
  status_page_id BIGINT   NOT NULL REFERENCES status_pages(id) ON DELETE CASCADE,
  monitor_id     BIGINT   NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  sort_order     INTEGER  NOT NULL DEFAULT 0,
  PRIMARY KEY (status_page_id, monitor_id)
);
CREATE INDEX status_page_monitors_monitor_idx ON status_page_monitors (monitor_id);

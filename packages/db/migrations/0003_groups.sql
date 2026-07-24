-- ============================================================================
-- 0003_groups — one-level monitor groups (folders)
--
-- Lightweight, single-level grouping so monitors can be organised and the list
-- collapsed by section. A monitor belongs to at most one group; deleting a group
-- leaves its monitors ungrouped (never deletes monitors).
-- ============================================================================

CREATE TABLE monitor_groups (
  id           BIGSERIAL   PRIMARY KEY,
  public_id    TEXT        NOT NULL UNIQUE,
  workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX monitor_groups_workspace_idx ON monitor_groups (workspace_id, sort_order);
CREATE TRIGGER monitor_groups_set_updated_at BEFORE UPDATE ON monitor_groups
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE monitors
  ADD COLUMN group_id BIGINT REFERENCES monitor_groups(id) ON DELETE SET NULL;
CREATE INDEX monitors_group_idx ON monitors (group_id);

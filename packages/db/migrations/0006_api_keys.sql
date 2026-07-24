-- ============================================================================
-- 0006_api_keys — developer API keys
--
-- Workspace-scoped API keys let developers integrate with the REST API and the
-- real-time WebSocket. Only the SHA-256 hash is stored; the full key is shown
-- once at creation. A short `prefix` is kept for display.
-- ============================================================================

CREATE TABLE api_keys (
  id           BIGSERIAL   PRIMARY KEY,
  public_id    TEXT        NOT NULL UNIQUE,
  workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  prefix       TEXT        NOT NULL,
  key_hash     TEXT        NOT NULL UNIQUE,
  last_used_at TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at   TIMESTAMPTZ
);
CREATE INDEX api_keys_workspace_idx ON api_keys (workspace_id);

-- ============================================================================
-- 0002_notifications — alerting channels and delivery log
--
-- Channels are workspace-scoped. The notifier resolves all enabled channels for
-- an event's workspace and dispatches via the matching connector. `config` holds
-- connector-specific settings (SMTP creds, Telegram token, webhook template);
-- secrets are masked by the API before they leave the server.
-- ============================================================================

CREATE TABLE notification_channels (
  id           BIGSERIAL   PRIMARY KEY,
  public_id    TEXT        NOT NULL UNIQUE,
  workspace_id BIGINT      NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL,             -- 'smtp' | 'telegram' | 'webhook'
  name         TEXT        NOT NULL,
  config       JSONB       NOT NULL DEFAULT '{}'::jsonb,
  enabled      BOOLEAN     NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_channels_workspace_idx ON notification_channels (workspace_id);
CREATE TRIGGER notification_channels_set_updated_at BEFORE UPDATE ON notification_channels
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only delivery log (status codec: 0 failed, 1 sent).
CREATE TABLE notification_deliveries (
  id                BIGSERIAL   PRIMARY KEY,
  channel_id        BIGINT      NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  monitor_public_id TEXT        NOT NULL,
  status            SMALLINT    NOT NULL,
  detail            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notification_deliveries_channel_idx
  ON notification_deliveries (channel_id, created_at DESC);

-- ============================================================================
-- 0005_monitor_notifications — per-monitor alert routing
--
-- Alerts are configured per monitor: each monitor links to zero or more
-- notification channels, and only those channels are notified when it changes
-- state (replacing the previous workspace-wide fan-out).
-- ============================================================================

CREATE TABLE monitor_notifications (
  monitor_id BIGINT NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  channel_id BIGINT NOT NULL REFERENCES notification_channels(id) ON DELETE CASCADE,
  PRIMARY KEY (monitor_id, channel_id)
);
CREATE INDEX monitor_notifications_channel_idx ON monitor_notifications (channel_id);

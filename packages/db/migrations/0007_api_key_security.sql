-- ============================================================================
-- 0007_api_key_security — scopes, expiry and IP allowlist for API keys
--
-- Robust restriction primitives:
--   * scopes: 'read' and/or 'write' (read-only keys cannot mutate).
--   * expires_at: optional automatic expiry.
--   * allowed_ips: optional CIDR/IP allowlist (NULL = any).
-- ============================================================================

ALTER TABLE api_keys
  ADD COLUMN scopes      TEXT[]      NOT NULL DEFAULT ARRAY['read', 'write'],
  ADD COLUMN expires_at  TIMESTAMPTZ,
  ADD COLUMN allowed_ips TEXT[];

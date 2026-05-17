-- =============================================================================
-- Avito Browser Sessions: persistent browser fingerprint + status fix
--
-- 1. browser_fingerprint JSONB — хранит уникальный fingerprint per-account
--    (viewport, UA, GPU, screen, noiseSeed для Canvas/Audio/ClientRects)
--    Генерируется один раз при первом подключении, не меняется.
--
-- 2. Фикс CHECK constraint — код использует 'awaiting_sms', но constraint
--    его не содержал. Добавляем.
-- =============================================================================

-- 1. Persistent browser fingerprint
ALTER TABLE avito_browser_sessions
  ADD COLUMN IF NOT EXISTS browser_fingerprint JSONB;

COMMENT ON COLUMN avito_browser_sessions.browser_fingerprint IS
  'Persistent browser fingerprint (viewport, UA, GPU, screen, noiseSeed). Generated once on first connect, reused on every re-login.';

-- 2. Fix status CHECK — add awaiting_sms
ALTER TABLE avito_browser_sessions
  DROP CONSTRAINT IF EXISTS avito_browser_sessions_status_check;

ALTER TABLE avito_browser_sessions
  ADD CONSTRAINT avito_browser_sessions_status_check
  CHECK (status IN ('pending', 'awaiting_sms', 'active', 'expired', 'error'));

-- 3. Comment on release_avito_proxy — now admin-only
COMMENT ON FUNCTION release_avito_proxy(UUID) IS
  'Releases proxy back to pool. Admin-only — user disconnect does NOT release proxy.';

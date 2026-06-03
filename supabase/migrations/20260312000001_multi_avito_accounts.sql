-- =============================================================================
-- Multi-Avito-Account Support
--
-- Расширяет систему для поддержки до 3 Avito аккаунтов на пользователя.
-- Top Floor Boss вариации: 1 аккаунт (10к), 2 аккаунта (15к), 3 аккаунта (20к).
--
-- Изменения:
-- 1. users: добавить avito_account_limit
-- 2. avito_browser_sessions: account_index + API credentials + nullable login
-- 3. avito_items/chats/orders/mapping: добавить session_id FK
-- 4. avito_proxies: claim_avito_proxy per-session
-- =============================================================================

-- ============================================================
-- 1. users — лимит Avito аккаунтов
-- ============================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS avito_account_limit INT NOT NULL DEFAULT 0;

-- Существующие TFB пользователи получают 1 аккаунт
UPDATE users SET avito_account_limit = 1
WHERE subscription_tier = 'top_floor_boss' AND avito_account_limit = 0;

-- ============================================================
-- 2. avito_browser_sessions — multi-account + API credentials
-- ============================================================

-- 2.1 Добавить account_index (1-3)
ALTER TABLE avito_browser_sessions ADD COLUMN IF NOT EXISTS account_index INT NOT NULL DEFAULT 1;
ALTER TABLE avito_browser_sessions ADD CONSTRAINT avito_browser_sessions_account_index_check
  CHECK (account_index BETWEEN 1 AND 3);

-- 2.2 Заменить UNIQUE(user_id) на UNIQUE(user_id, account_index)
-- Старый constraint: user_id UNIQUE (из CREATE TABLE ... user_id UUID NOT NULL UNIQUE)
ALTER TABLE avito_browser_sessions DROP CONSTRAINT IF EXISTS avito_browser_sessions_user_id_key;
ALTER TABLE avito_browser_sessions ADD CONSTRAINT avito_browser_sessions_user_account_key
  UNIQUE (user_id, account_index);

-- 2.3 Добавить API credentials (переезжают из users)
ALTER TABLE avito_browser_sessions ADD COLUMN IF NOT EXISTS avito_client_id VARCHAR(255);
ALTER TABLE avito_browser_sessions ADD COLUMN IF NOT EXISTS avito_client_secret VARCHAR(255);
ALTER TABLE avito_browser_sessions ADD COLUMN IF NOT EXISTS avito_user_id BIGINT;

-- 2.4 Сделать login/password nullable (API-only аккаунт без browser session)
ALTER TABLE avito_browser_sessions ALTER COLUMN avito_login DROP NOT NULL;
ALTER TABLE avito_browser_sessions ALTER COLUMN avito_password_enc DROP NOT NULL;

-- ============================================================
-- 3. Backfill: скопировать API credentials из users в sessions
-- ============================================================

-- 3.1 Обновить существующие сессии
UPDATE avito_browser_sessions abs
SET avito_client_id = u.avito_client_id,
    avito_client_secret = u.avito_client_secret,
    avito_user_id = u.avito_user_id
FROM users u
WHERE abs.user_id = u.id
  AND u.avito_client_id IS NOT NULL
  AND abs.avito_client_id IS NULL;

-- 3.2 Создать сессии для пользователей с API credentials но без browser session
INSERT INTO avito_browser_sessions (user_id, account_index, avito_client_id, avito_client_secret, avito_user_id, cookies, status)
SELECT u.id, 1, u.avito_client_id, u.avito_client_secret, u.avito_user_id, '[]'::jsonb, 'pending'
FROM users u
WHERE u.avito_client_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM avito_browser_sessions abs WHERE abs.user_id = u.id);

-- ============================================================
-- 4. Data tables — добавить session_id FK
-- ============================================================

-- 4.1 avito_items
ALTER TABLE avito_items ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES avito_browser_sessions(id) ON DELETE SET NULL;
UPDATE avito_items ai SET session_id = (
  SELECT abs.id FROM avito_browser_sessions abs
  WHERE abs.user_id = ai.user_id AND abs.account_index = 1
) WHERE ai.session_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_avito_items_session ON avito_items(session_id);

-- 4.2 avito_chats
ALTER TABLE avito_chats ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES avito_browser_sessions(id) ON DELETE SET NULL;
UPDATE avito_chats ac SET session_id = (
  SELECT abs.id FROM avito_browser_sessions abs
  WHERE abs.user_id = ac.user_id AND abs.account_index = 1
) WHERE ac.session_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_avito_chats_session ON avito_chats(session_id);

-- 4.3 avito_orders
ALTER TABLE avito_orders ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES avito_browser_sessions(id) ON DELETE SET NULL;
UPDATE avito_orders ao SET session_id = (
  SELECT abs.id FROM avito_browser_sessions abs
  WHERE abs.user_id = ao.user_id AND abs.account_index = 1
) WHERE ao.session_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_avito_orders_session ON avito_orders(session_id);

-- 4.4 avito_item_product_mapping
ALTER TABLE avito_item_product_mapping ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES avito_browser_sessions(id) ON DELETE SET NULL;
UPDATE avito_item_product_mapping m SET session_id = (
  SELECT abs.id FROM avito_browser_sessions abs
  WHERE abs.user_id = m.user_id AND abs.account_index = 1
) WHERE m.session_id IS NULL;

-- ============================================================
-- 5. avito_proxies — per-session (вместо per-user)
-- ============================================================

-- 5.1 Backfill: assigned_to раньше = user_id, теперь = session_id
UPDATE avito_proxies ap SET assigned_to = (
  SELECT abs.id FROM avito_browser_sessions abs
  WHERE abs.user_id = ap.assigned_to AND abs.account_index = 1
) WHERE ap.assigned_to IS NOT NULL;

-- 5.2 Обновить claim_avito_proxy: принимает session_id вместо user_id
-- DROP нужен т.к. PostgreSQL не позволяет переименовать параметры через CREATE OR REPLACE
DROP FUNCTION IF EXISTS claim_avito_proxy(UUID);
CREATE OR REPLACE FUNCTION claim_avito_proxy(p_session_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proxy_url TEXT;
BEGIN
  UPDATE avito_proxies
  SET assigned_to = p_session_id,
      updated_at  = now()
  WHERE id = (
    SELECT id
    FROM   avito_proxies
    WHERE  is_active   = true
      AND  assigned_to IS NULL
    LIMIT  1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING proxy_url INTO v_proxy_url;

  RETURN v_proxy_url;
END;
$$;

-- 5.3 Обновить release_avito_proxy: принимает session_id
DROP FUNCTION IF EXISTS release_avito_proxy(UUID);
CREATE OR REPLACE FUNCTION release_avito_proxy(p_session_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE avito_proxies
  SET assigned_to = NULL,
      updated_at  = now()
  WHERE assigned_to = p_session_id;
END;
$$;

COMMENT ON FUNCTION claim_avito_proxy(UUID) IS
  'Atomically claims a free proxy for an Avito session. Returns proxy_url or NULL.';
COMMENT ON FUNCTION release_avito_proxy(UUID) IS
  'Releases proxy back to pool. Admin-only — user disconnect does NOT release proxy.';

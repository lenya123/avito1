-- =============================================================================
-- Пул прокси для браузерных сессий Avito
--
-- Правило безопасности: без прокси сессия НЕ создаётся.
-- Каждый аккаунт Avito привязан к своему прокси навсегда.
-- Владелец вручную добавляет прокси через Supabase Studio.
-- =============================================================================

-- Таблица пула прокси
CREATE TABLE avito_proxies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  proxy_url   TEXT NOT NULL UNIQUE,       -- http://user:pass@host:port
  is_active   BOOLEAN NOT NULL DEFAULT true,
  assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON avito_proxies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Индексы
CREATE INDEX avito_proxies_assigned_to_idx ON avito_proxies (assigned_to);
CREATE INDEX avito_proxies_free_idx ON avito_proxies (is_active, assigned_to)
  WHERE is_active = true AND assigned_to IS NULL;

-- RLS: только владелец видит и управляет прокси
ALTER TABLE avito_proxies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_full_access" ON avito_proxies
  FOR ALL USING (public.is_owner());

-- =============================================================================
-- RPC: атомарное получение свободного прокси
--
-- Использует FOR UPDATE SKIP LOCKED — гарантирует что два параллельных
-- запроса не получат один и тот же прокси.
-- Возвращает proxy_url или NULL если свободных нет.
-- =============================================================================
DROP FUNCTION IF EXISTS claim_avito_proxy(UUID);
CREATE OR REPLACE FUNCTION claim_avito_proxy(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_proxy_url TEXT;
BEGIN
  UPDATE avito_proxies
  SET assigned_to = p_user_id,
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

  RETURN v_proxy_url; -- NULL если свободных нет
END;
$$;

-- =============================================================================
-- RPC: освобождение прокси при отключении сессии
-- =============================================================================
DROP FUNCTION IF EXISTS release_avito_proxy(UUID);
CREATE OR REPLACE FUNCTION release_avito_proxy(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE avito_proxies
  SET assigned_to = NULL,
      updated_at  = now()
  WHERE assigned_to = p_user_id;
END;
$$;

-- =============================================================================
-- Добавляем поля для SMS-верификации в существующую таблицу сессий
-- =============================================================================
ALTER TABLE avito_browser_sessions
  ADD COLUMN IF NOT EXISTS sms_code TEXT;

-- Комментарий: sms_code записывает клиент через /api/avito/session/sms
-- Worker читает его, вводит в браузер, затем очищает (SET sms_code = NULL)

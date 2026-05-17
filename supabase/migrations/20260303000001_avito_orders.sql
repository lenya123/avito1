-- Avito Orders: browser sessions + orders tables
-- Используется для синхронизации заказов Avito Доставка через браузерные cookies.
-- Официальный Avito API не даёт доступ к заказам без ИП-аккаунта.

-- ============================================================
-- avito_browser_sessions
-- Хранит credentials клиента и cookies браузерной сессии Avito.
-- proxy_url назначается платформой — клиент не вводит.
-- ============================================================
CREATE TABLE IF NOT EXISTS avito_browser_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  avito_login TEXT NOT NULL,
  avito_password_enc TEXT NOT NULL,   -- AES-256-GCM зашифрованный пароль
  cookies JSONB NOT NULL DEFAULT '[]',
  user_agent TEXT,
  proxy_url TEXT,                     -- назначается платформой
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'expired', 'error')),
  last_login_at TIMESTAMPTZ,
  last_sync_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Обновление updated_at
CREATE OR REPLACE TRIGGER avito_browser_sessions_updated_at
  BEFORE UPDATE ON avito_browser_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Индексы
CREATE INDEX IF NOT EXISTS avito_browser_sessions_user_id_idx ON avito_browser_sessions(user_id);
CREATE INDEX IF NOT EXISTS avito_browser_sessions_status_idx ON avito_browser_sessions(status);

-- RLS
ALTER TABLE avito_browser_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avito_browser_sessions_owner_all" ON avito_browser_sessions
  USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
    )
  );

CREATE POLICY "avito_browser_sessions_user_own" ON avito_browser_sessions
  USING (user_id = auth.uid());


-- ============================================================
-- avito_orders
-- Кешированные заказы из Avito Доставка.
-- Синхронизируются через BullMQ job каждые 20 мин.
-- ============================================================
CREATE TABLE IF NOT EXISTS avito_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avito_order_id VARCHAR(255) NOT NULL,
  status TEXT,
  status_label TEXT,
  required_action BOOLEAN NOT NULL DEFAULT FALSE,
  item_title TEXT,
  item_img_url TEXT,
  cost_total INTEGER,                 -- рубли
  provider TEXT,
  provider_label TEXT,
  tracking_number TEXT,
  channel_id TEXT,
  service_key TEXT,
  created_at_avito TIMESTAMPTZ,
  updated_at_avito TIMESTAMPTZ,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, avito_order_id)
);

-- Индексы
CREATE INDEX IF NOT EXISTS avito_orders_user_id_idx ON avito_orders(user_id);
CREATE INDEX IF NOT EXISTS avito_orders_user_status_idx ON avito_orders(user_id, status);
CREATE INDEX IF NOT EXISTS avito_orders_user_created_idx ON avito_orders(user_id, created_at_avito DESC);

-- RLS
ALTER TABLE avito_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "avito_orders_owner_all" ON avito_orders
  USING (
    EXISTS (
      SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'owner'
    )
  );

CREATE POLICY "avito_orders_user_own" ON avito_orders
  USING (user_id = auth.uid());

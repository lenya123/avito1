-- Stage 2.2 — Таблица customers.
--
-- Клиенты оптовика (дроперы) — отдельная сущность от users/owner/shipper.
-- Якорь: tg_user_id (BIGINT), т.к. клиент появляется только через /start
-- в customer-боте (Stage 3). Адреса клиентов НЕ храним — дропшиппинг.
-- Замеры тела НЕ нужны. +ВАЙБ-кредит, блокировка, ценовой уровень "топ".

CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tg_user_id BIGINT NOT NULL UNIQUE,
  telegram_username VARCHAR(64),
  name VARCHAR(255),
  phone VARCHAR(32),

  -- Ценовой уровень: TRUE → products.drop_price_top (fallback на drop_price если NULL)
  is_top BOOLEAN NOT NULL DEFAULT FALSE,

  -- +ВАЙБ-кредит
  vibe_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  vibe_credit_limit_override NUMERIC(12, 2),
  is_frozen BOOLEAN NOT NULL DEFAULT FALSE,
  frozen_at TIMESTAMPTZ,

  -- Блокировка (новые заказы запрещены, открытые — продолжаются)
  is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
  blocked_reason TEXT,

  -- Свободный текст владельца
  notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_tg_user_id ON public.customers(tg_user_id);
CREATE INDEX IF NOT EXISTS idx_customers_frozen ON public.customers(is_frozen)
  WHERE is_frozen = TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_blocked ON public.customers(is_blocked)
  WHERE is_blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_vibe ON public.customers(vibe_enabled)
  WHERE vibe_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_customers_top ON public.customers(is_top)
  WHERE is_top = TRUE;

-- RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Только owner/admin. Customer-bot ходит под service_role → RLS обходит.
-- Shipper НЕ видит customers: в заказах для shipper-а имя клиента
-- денормализуется в orders.customer_name_snapshot.
CREATE POLICY customers_owner_all ON public.customers
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

-- Trigger updated_at
CREATE OR REPLACE FUNCTION public.customers_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.customers_touch_updated_at();

COMMENT ON TABLE public.customers IS
  'Клиенты оптовика (дроперы). Якорь — tg_user_id. Создаются только через /start в customer-боте.';
COMMENT ON COLUMN public.customers.is_top IS
  'Ценовой уровень. TRUE → продукты цитируются по products.drop_price_top (NULL → fallback на drop_price).';
COMMENT ON COLUMN public.customers.vibe_credit_limit_override IS
  'Индивидуальный лимит +ВАЙБ-кредита. NULL → business_settings.vibe_credit_default_limit.';
COMMENT ON COLUMN public.customers.is_frozen IS
  'Автоматически ставится триггером при превышении лимита +ВАЙБ. Авторазморозка — при погашении.';
COMMENT ON COLUMN public.customers.is_blocked IS
  'Ручная блокировка владельцем. Новые заказы запрещены; открытые продолжаются без изменений.';

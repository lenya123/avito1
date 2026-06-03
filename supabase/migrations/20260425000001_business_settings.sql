-- Stage 2.1 — Singleton-таблица business_settings.
--
-- Мотивация: разгружаем устаревшую users.shop_name/bio и добавляем новые поля
-- для B2B SaaS: лимит +ВАЙБ по умолчанию, порог подтверждения чеков, шаблон
-- реквизитов, срок лицензии.
--
-- Архитектура: одна строка на инсталляцию (single-tenant), уникальный индекс
-- ON ((true)) гарантирует синглтон. Бэкфилл одной строки делает миграцию
-- самодостаточной — последующие ALTER-ы всегда имеют куда писать.

CREATE TABLE IF NOT EXISTS public.business_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name TEXT,
  business_bio TEXT,
  vibe_credit_default_limit NUMERIC(12, 2) NOT NULL DEFAULT 0,
  vibe_receipt_confirm_threshold NUMERIC(12, 2),
  payment_requisites_message TEXT,
  licence_expires_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Синглтон: уникальный индекс на выражение TRUE разрешает только одну строку.
CREATE UNIQUE INDEX IF NOT EXISTS business_settings_singleton
  ON public.business_settings ((TRUE));

-- Бэкфилл одной строки. business_name берём из первого owner-а с непустым shop_name.
INSERT INTO public.business_settings (business_name, business_bio)
SELECT u.shop_name, u.bio
FROM public.users u
WHERE u.role = 'owner'
ORDER BY u.created_at ASC NULLS LAST
LIMIT 1
ON CONFLICT DO NOTHING;

-- Если owner-а не нашлось (тестовая среда) — создаём пустую запись,
-- чтобы последующие UPDATE-ы и FE-хуки на singleton не падали.
INSERT INTO public.business_settings (business_name)
SELECT NULL
WHERE NOT EXISTS (SELECT 1 FROM public.business_settings);

-- RLS
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Owner видит/пишет всё; shipper читает только (нужен business_name для шапки PWA).
-- INSERT/DELETE не даём никому — синглтон создан миграцией.
CREATE POLICY business_settings_select ON public.business_settings
  FOR SELECT TO authenticated
  USING (public.is_owner() OR public.is_shipper());

CREATE POLICY business_settings_update ON public.business_settings
  FOR UPDATE TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

-- Trigger на updated_at
CREATE OR REPLACE FUNCTION public.business_settings_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_business_settings_updated_at ON public.business_settings;
CREATE TRIGGER trg_business_settings_updated_at
  BEFORE UPDATE ON public.business_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.business_settings_touch_updated_at();

COMMENT ON TABLE public.business_settings IS
  'Singleton: настройки бизнеса (бренд, +ВАЙБ-лимит, шаблон реквизитов, лицензия). Одна строка на инсталляцию.';
COMMENT ON COLUMN public.business_settings.vibe_credit_default_limit IS
  'Дефолтный лимит +ВАЙБ-кредита в рублях. customers.vibe_credit_limit_override может его переопределить.';
COMMENT ON COLUMN public.business_settings.vibe_receipt_confirm_threshold IS
  'Порог суммы чека, свыше которого требуется ручное подтверждение. NULL — автоподтверждение всегда.';
COMMENT ON COLUMN public.business_settings.payment_requisites_message IS
  'Шаблон сообщения с реквизитами. Переменные: {{amount}}, {{order_numbers}}, {{card_label}}, {{deadline}}.';
COMMENT ON COLUMN public.business_settings.licence_expires_at IS
  'Хук на биллинг-трек (оплата SaaS off-platform). В коде сейчас не используется.';

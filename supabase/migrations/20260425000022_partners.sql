-- Stage 3.8 — партнёры (другие оптовики, чьи товары владелец продаёт за комиссию).
--
-- Партнёр сам отправляет товар клиенту, владельцу возвращает фикс-комиссию
-- с каждого заказа. Партнёр привязан к partner-bot через invite-токен
-- (deep-link `t.me/<bot>?start=<token>`). Telegram не позволяет боту писать
-- первым — пока tg_user_id IS NULL, бот не сможет отправить запрос реквизитов.
--
-- Partner-bot токен: TELEGRAM_PARTNER_BOT_TOKEN (env).
-- Webhook: /api/telegram/partner.

CREATE TABLE IF NOT EXISTS public.partners (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tg_username VARCHAR(64),
  tg_user_id BIGINT UNIQUE,
  invite_token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partners_active ON public.partners(is_active);
CREATE INDEX IF NOT EXISTS idx_partners_tg_user_id ON public.partners(tg_user_id);

COMMENT ON TABLE public.partners IS
  'Партнёры — поставщики чужих товаров на условиях фикс-комиссии. Stage 3.8.';
COMMENT ON COLUMN public.partners.tg_user_id IS
  'Telegram ID партнёра (заполняется когда он сделает /start <invite_token> в partner-bot).';
COMMENT ON COLUMN public.partners.invite_token IS
  'Одноразовый (логически) токен для deep-link приглашения партнёра в partner-bot.';

-- Колонки на products: связь с партнёром + фикс-комиссия в ₽.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_commission NUMERIC(10, 2);

CREATE INDEX IF NOT EXISTS idx_products_partner_id ON public.products(partner_id)
  WHERE partner_id IS NOT NULL;

COMMENT ON COLUMN public.products.partner_id IS
  'Если != NULL — товар партнёрский, отправляет партнёр, владелец получает только commission.';
COMMENT ON COLUMN public.products.partner_commission IS
  'Фиксированная сумма ₽, которую партнёр отдаёт владельцу за каждый проданный заказ.';

-- Колонки на orders: snapshot комиссии + поля для partner-флоу.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS partner_commission_snapshot NUMERIC(10, 2),
  ADD COLUMN IF NOT EXISTS partner_requisites_text TEXT,
  ADD COLUMN IF NOT EXISTS partner_payment_received_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partner_commission_paid_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON public.orders(partner_id)
  WHERE partner_id IS NOT NULL;

COMMENT ON COLUMN public.orders.partner_id IS
  'Если != NULL — заказ партнёрский, отправляет партнёр; shipper-PWA эти заказы не показывает.';
COMMENT ON COLUMN public.orders.partner_commission_snapshot IS
  'Комиссия владельца на момент заказа (снимок из products.partner_commission).';
COMMENT ON COLUMN public.orders.partner_requisites_text IS
  'Реквизиты партнёра, переданные клиенту (приходит от партнёра в partner-bot).';
COMMENT ON COLUMN public.orders.partner_payment_received_at IS
  'Когда партнёр подтвердил получение оплаты от клиента (inline-кнопка ✅ Получил).';
COMMENT ON COLUMN public.orders.partner_commission_paid_at IS
  'Когда владелец отметил, что получил комиссию от партнёра.';

-- RLS: только owner.
ALTER TABLE public.partners ENABLE ROW LEVEL SECURITY;

CREATE POLICY partners_owner_all ON public.partners
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

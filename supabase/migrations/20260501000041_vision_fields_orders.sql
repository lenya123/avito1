-- Этап 4: vision_operation_id в orders для anti-replay.
-- Копируется из pending_orders при confirm_pending_order_atomic.
-- Index по vision_operation_id для быстрой проверки повторного использования.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS vision_operation_id TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_card_last4 TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_phone TEXT,
  ADD COLUMN IF NOT EXISTS vision_recipient_ip_name TEXT,
  ADD COLUMN IF NOT EXISTS vision_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS vision_raw_text TEXT,
  ADD COLUMN IF NOT EXISTS confirmed_by TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_vision_operation_id
  ON public.orders(vision_operation_id)
  WHERE vision_operation_id IS NOT NULL;

COMMENT ON COLUMN public.orders.confirmed_by IS
  'Источник подтверждения оплаты: vision | director | partner | owner';

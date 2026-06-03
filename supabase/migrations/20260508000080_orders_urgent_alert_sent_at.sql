-- Shipper-bot DM-алерты (фаза 1, шаг #6).
--
-- Идемпотентность для алерта «срочный новый заказ — отправить сегодня»:
-- helper notifyShippersOrderUrgent шлёт DM всем shipper'ам один раз на заказ.
-- Колонка маркируется при первой успешной отправке; повторные триггеры
-- (рестарт worker'а, повторный confirm-payment idempotent path) не дублируют DM.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS urgent_alert_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.urgent_alert_sent_at IS
  'Shipper-bot: момент отправки DM-алерта «срочный заказ — send_by сегодня». NULL = не слали.';

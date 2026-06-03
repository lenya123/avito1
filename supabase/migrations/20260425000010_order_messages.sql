-- Stage 2.5 — Переписка по заказам (owner ↔ customer через Telegram).
--
-- Каждый заказ живёт в "топике" супергруппы владельца (по дизайну Stage 3).
-- Здесь фиксируем все сообщения (outbound от владельца/бота, inbound от клиента):
-- summary заказа, чек, произвольные заметки, апдейты статуса.

CREATE TABLE IF NOT EXISTS public.order_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,

  -- Адрес сообщения в Telegram (супергруппа владельца или DM с клиентом).
  tg_chat_id BIGINT NOT NULL,
  tg_message_id BIGINT NOT NULL,
  tg_thread_id BIGINT,                     -- топик "заказы" в супергруппе

  kind TEXT NOT NULL CHECK (kind IN ('summary', 'receipt', 'note', 'status_update')),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  body TEXT,
  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tg_chat_id, tg_message_id)
);

CREATE INDEX IF NOT EXISTS idx_order_messages_order ON public.order_messages(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_order_messages_chat ON public.order_messages(tg_chat_id, tg_thread_id);

ALTER TABLE public.order_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_messages_owner_all ON public.order_messages
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

-- Shipper видит сообщения только по заказам в активных статусах сборки/доставки.
CREATE POLICY order_messages_shipper_select ON public.order_messages
  FOR SELECT TO authenticated
  USING (
    public.is_shipper()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_messages.order_id
        AND o.status IN ('awaiting_shipment', 'collecting', 'in_transit',
                         'return_in_transit', 'return_arrived')
    )
  );

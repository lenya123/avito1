-- Stage 3.7 — ID топиков супергруппы заказов в business_settings.
--
-- Owner-bot постит summary каждого заказа в топик «Заказы» супергруппы,
-- редактирует пост при смене статуса, шлёт reply с чеком в топик «Оплаты».
-- ID топиков владелец задаёт через Supabase Studio (UI в Stage 8).

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS orders_topic_id BIGINT,
  ADD COLUMN IF NOT EXISTS payments_topic_id BIGINT,
  ADD COLUMN IF NOT EXISTS returns_topic_id BIGINT;

COMMENT ON COLUMN public.business_settings.orders_topic_id IS
  'message_thread_id топика «Заказы» в TELEGRAM_ORDERS_GROUP_ID. NULL = постинг отключён.';
COMMENT ON COLUMN public.business_settings.payments_topic_id IS
  'message_thread_id топика «Оплаты» в супергруппе. NULL = постинг отключён.';
COMMENT ON COLUMN public.business_settings.returns_topic_id IS
  'message_thread_id топика «Возвраты» в супергруппе. NULL = постинг отключён.';

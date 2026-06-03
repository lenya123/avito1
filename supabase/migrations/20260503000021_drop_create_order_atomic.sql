-- create_order_atomic больше не нужна: legacy +ВАЙБ-flow через прямой insert в orders
-- удаляется. Все +ВАЙБ-заказы (и собственные, и партнёрские) теперь идут через
-- create_pending_order_atomic v5 с p_is_vibe_debt=TRUE → confirm_pending_order_atomic v10
-- создаёт orders с is_paid=false, payment_method='deposit'.

DROP FUNCTION IF EXISTS public.create_order_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC
);

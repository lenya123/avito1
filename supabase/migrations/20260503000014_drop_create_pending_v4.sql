-- Снос старой сигнатуры create_pending_order_atomic (v4) перед расширением (v5 с source).

DROP FUNCTION IF EXISTS public.create_pending_order_atomic(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, DATE, UUID, INTEGER
);

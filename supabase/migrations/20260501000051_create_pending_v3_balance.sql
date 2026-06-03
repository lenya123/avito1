-- Часть 1/2: дроп старой версии (поменяем return type, нужен DROP).

DROP FUNCTION IF EXISTS public.create_pending_order_atomic(
  UUID, UUID, UUID, NUMERIC, TEXT, TEXT, DATE, UUID, INTEGER
);

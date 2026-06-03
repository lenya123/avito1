-- Снос старой сигнатуры cancel_pending_order_atomic перед расширением
-- (v3 принимает 4 новых параметра — credit/debt/zero-out/reason).

DROP FUNCTION IF EXISTS public.cancel_pending_order_atomic(UUID);

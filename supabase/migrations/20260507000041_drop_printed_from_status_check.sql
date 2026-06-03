-- ============================================================================
-- Объединение printed + collecting (шаг 2/2) — пересоздать CHECK без 'printed'
-- ============================================================================
-- После backfill 20260507000040 строк со status='printed' нет, можно убрать
-- значение из CHECK-constraint.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;

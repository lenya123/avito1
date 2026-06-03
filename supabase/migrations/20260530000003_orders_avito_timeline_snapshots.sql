-- ============================================================================
-- ТЗ Авито-заказы (§8.2): поля-снапшоты ключевых моментов логистики.
--
--   delivered_at         — момент, когда покупатель забрал из ПВЗ Авито
--                          (status → delivered). Для дроп-заказов остаётся NULL.
--   return_initiated_at  — момент, когда покупатель оформил возврат на Авито
--                          (status → return_in_transit для Авито,
--                          status → return для дропа).
--   return_arrived_at    — момент, когда возврат приехал на ПВЗ
--                          (status → return).
--
-- Полная история переходов остаётся в status_history (JSONB на orders).
-- Эти поля — для быстрого рендера и аналитики без join'а.
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivered_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_initiated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS return_arrived_at   TIMESTAMPTZ;

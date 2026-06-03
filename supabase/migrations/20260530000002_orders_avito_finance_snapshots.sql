-- ============================================================================
-- ТЗ Авито-заказы (§6.1): per-order финансовые снапшоты Авито.
--
--   avito_fee_snapshot       — комиссия Авито с продажи (₽), приходит из API
--                              при синке заказа.
--   avito_marketing_snapshot — маркетинг на привлечение (₽), per-order.
--                              Если API не отдаёт per-order (§6.3) — оставляем
--                              NULL, маркетинг учитываем на уровне периода в
--                              журнале расходов.
--
-- Формула прибыли Авито (§6.1):
--   ownerCost = purchase_price + shipper_rate_snapshot
--             + COALESCE(avito_fee_snapshot, 0)
--             + COALESCE(avito_marketing_snapshot, 0)
-- ============================================================================

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS avito_fee_snapshot       NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS avito_marketing_snapshot NUMERIC(12, 2);

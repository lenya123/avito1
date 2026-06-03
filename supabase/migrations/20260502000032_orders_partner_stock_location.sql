-- Snapshot partner_stock_location на orders. Копируется из pending_orders
-- при confirm_pending_order_atomic. NULL для не-партнёрских.
--
-- Существующие partner-orders (до этой миграции) останутся NULL — это
-- эквивалентно 'partner_warehouse' по логике shipper API
-- (фильтр: partner_id IS NULL OR partner_stock_location = 'owner_warehouse').

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_stock_location TEXT
    CHECK (partner_stock_location IS NULL
           OR partner_stock_location IN ('partner_warehouse', 'owner_warehouse'));

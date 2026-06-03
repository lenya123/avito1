-- Snapshot partner_stock_location на pending_orders. Копируется из
-- products при create_pending_order_atomic. NULL для не-партнёрских.

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS partner_stock_location TEXT
    CHECK (partner_stock_location IS NULL
           OR partner_stock_location IN ('partner_warehouse', 'owner_warehouse'));

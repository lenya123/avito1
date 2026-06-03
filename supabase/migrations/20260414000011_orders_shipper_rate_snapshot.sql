-- ============================================================================
-- orders.shipper_rate_snapshot — историческая ставка шипера
-- ============================================================================
-- При отгрузке (executeShip) фиксируем ставку из seller_shippers на момент отгрузки,
-- чтобы последующее изменение ставки в seller_shippers не пересчитывало задним числом
-- старые выплаты в /seller/finance и /owner/finance.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipper_rate_snapshot NUMERIC(10, 2);

COMMENT ON COLUMN orders.shipper_rate_snapshot IS
  'Ставка шипера на момент отгрузки. Заполняется в executeShip из seller_shippers.rate. NULL для старых заказов и заказов не отгружавшихся.';

-- ============================================================================
-- Multi-seller phase A.2: products.seller_id (additive)
-- ============================================================================
-- Добавляем products.seller_id как первичный источник владения товаром.
-- products.created_by остаётся как deprecated для обратной совместимости —
-- синхронизируется триггером, удаляется в следующем заходе после миграции кода.

ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id);

-- Backfill из created_by (где оно есть)
UPDATE products SET seller_id = created_by WHERE seller_id IS NULL AND created_by IS NOT NULL;

-- Индекс
CREATE INDEX IF NOT EXISTS idx_products_seller_id ON products(seller_id);
CREATE INDEX IF NOT EXISTS idx_products_seller_active
  ON products(seller_id, is_active) WHERE deleted_at IS NULL;

-- Триггер: синхронизируем seller_id <-> created_by для обратной совместимости
-- Если код пишет created_by — копируем в seller_id; если пишет seller_id — в created_by.
CREATE OR REPLACE FUNCTION sync_products_seller_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.seller_id IS NULL AND NEW.created_by IS NOT NULL THEN
    NEW.seller_id := NEW.created_by;
  ELSIF NEW.created_by IS NULL AND NEW.seller_id IS NOT NULL THEN
    NEW.created_by := NEW.seller_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_products_seller_id ON products;
CREATE TRIGGER trg_sync_products_seller_id
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION sync_products_seller_id();

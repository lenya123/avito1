-- ============================================================================
-- Multi-seller phase A.4: orders.seller_id
-- ============================================================================
-- Денормализованный seller_id на заказе, чтобы избежать двухэтапных JOIN'ов
-- (products → orders). Заполняется триггером BEFORE INSERT из products.seller_id.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS seller_id UUID REFERENCES users(id);

-- Триггер: при INSERT подставляем seller_id из products
CREATE OR REPLACE FUNCTION orders_set_seller_id()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.seller_id IS NULL AND NEW.product_id IS NOT NULL THEN
    SELECT seller_id INTO NEW.seller_id FROM products WHERE id = NEW.product_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_orders_set_seller_id ON orders;
CREATE TRIGGER trg_orders_set_seller_id
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION orders_set_seller_id();

-- Backfill существующих заказов
UPDATE orders o
SET seller_id = p.seller_id
FROM products p
WHERE o.product_id = p.id AND o.seller_id IS NULL;

-- Индексы для фильтрации
CREATE INDEX IF NOT EXISTS idx_orders_seller_id ON orders(seller_id);
CREATE INDEX IF NOT EXISTS idx_orders_seller_status ON orders(seller_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);

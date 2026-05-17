-- Бронирование для товаров без размеров
-- Добавляем stock-tracking на уровне products (аналогично product_sizes)

-- 1. Stock-tracking для товаров без размеров
ALTER TABLE products ADD COLUMN current_quantity INT;
ALTER TABLE products ADD COLUMN reserved_quantity INT DEFAULT 0;

-- Инициализируем current_quantity для существующих товаров без размеров
-- (purchase_quantity минус количество активных заказов без размера)
UPDATE products p
SET current_quantity = GREATEST(
  COALESCE(p.purchase_quantity, 0) - (
    SELECT COUNT(*) FROM orders o
    WHERE o.product_id = p.id
      AND o.product_size_id IS NULL
      AND o.status NOT IN ('cancelled', 'disposed')
  ), 0)
WHERE NOT EXISTS (
  SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id
);

-- 2. Расширяем size_reservations для поддержки product-level резервов
ALTER TABLE size_reservations ADD COLUMN product_id UUID REFERENCES products(id) ON DELETE CASCADE;
ALTER TABLE size_reservations ALTER COLUMN product_size_id DROP NOT NULL;

-- Заменяем уникальный индекс: partial indexes для обоих типов
ALTER TABLE size_reservations DROP CONSTRAINT size_reservations_product_size_id_session_id_key;
CREATE UNIQUE INDEX idx_reservation_size_session
  ON size_reservations(product_size_id, session_id) WHERE product_size_id IS NOT NULL;
CREATE UNIQUE INDEX idx_reservation_product_session
  ON size_reservations(product_id, session_id) WHERE product_id IS NOT NULL;

-- CHECK: ровно одно из двух должно быть заполнено
ALTER TABLE size_reservations ADD CONSTRAINT chk_reservation_target
  CHECK (
    (product_size_id IS NOT NULL AND product_id IS NULL) OR
    (product_size_id IS NULL AND product_id IS NOT NULL)
  );

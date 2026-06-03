-- ============================================================================
-- Sizeless: повторный backfill "One Size" + self-contained RPC
-- ============================================================================
-- 1) Ловим товары, созданные после миграции 20260310000002, у которых нет
--    ни одной строки в product_sizes (owner/seller POST раньше не создавал
--    'One Size' при sizes=[]).
-- 2) Пересоздаём create_product_with_sizes так, чтобы при пустом p_sizes
--    RPC сама вставляла строку 'One Size' с quantity = purchase_quantity.
--    Это делает RPC единственным безопасным путём создания товара.

BEGIN;

-- === Idempotent backfill ===
-- session_replication_role = 'replica' отключает пользовательские триггеры
-- (см. 20260413000002) чтобы не рассылать push-уведомления на бэкфил.
SET LOCAL session_replication_role = 'replica';

INSERT INTO product_sizes (product_id, size, initial_quantity, current_quantity, reserved_quantity)
SELECT
  p.id,
  'One Size',
  COALESCE(p.purchase_quantity, p.current_quantity, 0),
  COALESCE(p.current_quantity, 0),
  COALESCE(p.reserved_quantity, 0)
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id
);

-- После insert пересчитываем is_in_stock для товаров, которые мы только что
-- снабдили строкой. recompute_product_in_stock идемпотентна.
UPDATE products p
SET is_in_stock = (
  COALESCE(
    (SELECT SUM(current_quantity - COALESCE(reserved_quantity, 0))
       FROM product_sizes ps WHERE ps.product_id = p.id),
    0
  ) > 0
)
WHERE EXISTS (
  SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id AND ps.size = 'One Size'
);

-- === Backfill orders.product_size_id и size_reservations.product_size_id ===
-- Старые записи с product_size_id = NULL ссылаем на 'One Size' строку товара
-- (она теперь гарантированно существует после backfill выше).
UPDATE orders o
SET product_size_id = ps.id
FROM product_sizes ps
WHERE o.product_size_id IS NULL
  AND o.product_id = ps.product_id
  AND ps.size = 'One Size';

UPDATE size_reservations r
SET product_size_id = ps.id
FROM product_sizes ps
WHERE r.product_size_id IS NULL
  AND r.product_id IS NOT NULL
  AND r.product_id = ps.product_id
  AND ps.size = 'One Size';

SET LOCAL session_replication_role = 'origin';

-- === Self-contained RPC ===
CREATE OR REPLACE FUNCTION create_product_with_sizes(
  p_product JSONB,
  p_sizes JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_size JSONB;
  v_purchase_qty INT;
BEGIN
  v_purchase_qty := COALESCE((p_product->>'purchase_quantity')::INT, 0);

  INSERT INTO products (
    name,
    brand,
    category,
    description,
    purchase_price,
    drop_price,
    recommended_price,
    photo_urls,
    is_premium,
    is_active,
    expected_arrival_date,
    measurements,
    location_city,
    seller_id,
    purchase_quantity
  ) VALUES (
    p_product->>'name',
    p_product->>'brand',
    p_product->>'category',
    p_product->>'description',
    (p_product->>'purchase_price')::NUMERIC,
    (p_product->>'drop_price')::NUMERIC,
    NULLIF(p_product->>'recommended_price', '')::NUMERIC,
    ARRAY(SELECT jsonb_array_elements_text(p_product->'photo_urls')),
    COALESCE((p_product->>'is_premium')::BOOLEAN, FALSE),
    COALESCE((p_product->>'is_active')::BOOLEAN, TRUE),
    NULLIF(p_product->>'expected_arrival_date', '')::DATE,
    p_product->'measurements',
    NULLIF(p_product->>'location_city', ''),
    (p_product->>'seller_id')::UUID,
    v_purchase_qty
  ) RETURNING id INTO v_product_id;

  IF jsonb_array_length(p_sizes) = 0 THEN
    -- Sizeless: вставляем ровно одну строку 'One Size'
    INSERT INTO product_sizes (
      product_id,
      size,
      initial_quantity,
      current_quantity
    ) VALUES (
      v_product_id,
      'One Size',
      v_purchase_qty,
      v_purchase_qty
    );
  ELSE
    FOR v_size IN SELECT * FROM jsonb_array_elements(p_sizes) LOOP
      INSERT INTO product_sizes (
        product_id,
        size,
        initial_quantity,
        current_quantity
      ) VALUES (
        v_product_id,
        v_size->>'size',
        (v_size->>'quantity')::INT,
        (v_size->>'quantity')::INT
      );
    END LOOP;
  END IF;

  RETURN v_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_product_with_sizes(JSONB, JSONB) TO service_role;

-- === Расширяем recompute_product_in_stock: зеркалит product_sizes → products.*_quantity ===
-- Колонки products.current_quantity / reserved_quantity / purchase_quantity остаются
-- как read-only зеркало для legacy-читателей. Пишем только в product_sizes; триггер
-- пересчитает и обновит зеркала автоматически.
CREATE OR REPLACE FUNCTION recompute_product_in_stock(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current INT;
  v_reserved INT;
  v_initial INT;
  v_should_be_in_stock BOOLEAN;
  v_old_in_stock BOOLEAN;
BEGIN
  SELECT
    COALESCE(SUM(current_quantity), 0),
    COALESCE(SUM(reserved_quantity), 0),
    COALESCE(SUM(initial_quantity), 0)
  INTO v_current, v_reserved, v_initial
  FROM product_sizes
  WHERE product_id = p_product_id;

  v_should_be_in_stock := ((v_current - v_reserved) > 0);

  SELECT is_in_stock INTO v_old_in_stock FROM products WHERE id = p_product_id;

  -- Всегда пишем зеркала current/reserved/purchase; is_in_stock меняем только
  -- при реальном переходе, чтобы не флипать trigger_product_arrival впустую.
  UPDATE products
  SET
    current_quantity = v_current,
    reserved_quantity = v_reserved,
    purchase_quantity = GREATEST(v_initial, COALESCE(purchase_quantity, 0)),
    is_in_stock = CASE
      WHEN v_old_in_stock IS DISTINCT FROM v_should_be_in_stock THEN v_should_be_in_stock
      ELSE is_in_stock
    END
  WHERE id = p_product_id;
END $$;

COMMIT;

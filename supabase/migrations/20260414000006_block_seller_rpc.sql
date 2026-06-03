-- ============================================================================
-- Multi-seller phase A.7: block_seller / unblock_seller RPC
-- ============================================================================
-- Атомарная блокировка селлера: is_blocked=true + деактивация товаров +
-- снятие активных size_reservations + возврат reserved_quantity.
-- Симметричная unblock_seller возвращает is_active=true, но резервы не восстанавливает.

CREATE OR REPLACE FUNCTION block_seller(
  p_seller_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Блокируем пользователя
  UPDATE users
  SET is_blocked = TRUE,
      blocked_reason = COALESCE(p_reason, blocked_reason),
      updated_at = NOW()
  WHERE id = p_seller_id AND role = 'seller';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller % not found', p_seller_id;
  END IF;

  -- Деактивируем все товары селлера
  UPDATE products
  SET is_active = FALSE,
      updated_at = NOW()
  WHERE seller_id = p_seller_id;

  -- Снимаем reserved_quantity по product_sizes товаров селлера
  UPDATE product_sizes ps
  SET reserved_quantity = GREATEST(
    COALESCE(ps.reserved_quantity, 0) - (
      SELECT COUNT(*) FROM size_reservations sr
      WHERE sr.product_size_id = ps.id
    ),
    0
  ),
  updated_at = NOW()
  WHERE product_id IN (SELECT id FROM products WHERE seller_id = p_seller_id);

  -- Снимаем reserved_quantity по товарам без размеров
  UPDATE products p
  SET reserved_quantity = GREATEST(
    COALESCE(p.reserved_quantity, 0) - (
      SELECT COUNT(*) FROM size_reservations sr WHERE sr.product_id = p.id
    ),
    0
  )
  WHERE seller_id = p_seller_id;

  -- Удаляем резервации по товарам селлера
  DELETE FROM size_reservations
  WHERE product_size_id IN (
    SELECT ps.id FROM product_sizes ps
    JOIN products p ON p.id = ps.product_id
    WHERE p.seller_id = p_seller_id
  ) OR product_id IN (SELECT id FROM products WHERE seller_id = p_seller_id);
END;
$$;

CREATE OR REPLACE FUNCTION unblock_seller(p_seller_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET is_blocked = FALSE,
      blocked_reason = NULL,
      updated_at = NOW()
  WHERE id = p_seller_id AND role = 'seller';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller % not found', p_seller_id;
  END IF;

  -- Активируем товары (но не восстанавливаем резервы — клиенты могли переоформить)
  UPDATE products
  SET is_active = TRUE,
      updated_at = NOW()
  WHERE seller_id = p_seller_id;
END;
$$;

GRANT EXECUTE ON FUNCTION block_seller(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION unblock_seller(UUID) TO service_role;

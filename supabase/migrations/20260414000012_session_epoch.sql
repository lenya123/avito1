-- ============================================================================
-- users.session_epoch — счётчик инвалидации сессий
-- ============================================================================
-- При логине JWT содержит текущий session_epoch. Guards сравнивают epoch в JWT
-- с актуальным в БД — если не совпало (например, владелец заблокировал селлера),
-- сессия считается невалидной и пользователь выкидывается на логин.
--
-- block_seller увеличивает epoch у заблокированного селлера.

ALTER TABLE users ADD COLUMN IF NOT EXISTS session_epoch INT NOT NULL DEFAULT 0;

COMMENT ON COLUMN users.session_epoch IS
  'Счётчик инвалидации сессий. При блокировке или rotate-key увеличивается, все старые JWT становятся невалидными.';

-- Обновляем block_seller — инкрементируем epoch при блокировке
CREATE OR REPLACE FUNCTION block_seller(
  p_seller_id UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET is_blocked = TRUE,
      blocked_reason = COALESCE(p_reason, blocked_reason),
      session_epoch = session_epoch + 1,
      updated_at = NOW()
  WHERE id = p_seller_id AND role = 'seller';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller % not found', p_seller_id;
  END IF;

  UPDATE products
  SET is_active = FALSE,
      updated_at = NOW()
  WHERE seller_id = p_seller_id;

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

  UPDATE products p
  SET reserved_quantity = GREATEST(
    COALESCE(p.reserved_quantity, 0) - (
      SELECT COUNT(*) FROM size_reservations sr WHERE sr.product_id = p.id
    ),
    0
  )
  WHERE seller_id = p_seller_id;

  DELETE FROM size_reservations
  WHERE product_size_id IN (
    SELECT ps.id FROM product_sizes ps
    JOIN products p ON p.id = ps.product_id
    WHERE p.seller_id = p_seller_id
  ) OR product_id IN (SELECT id FROM products WHERE seller_id = p_seller_id);
END;
$$;

GRANT EXECUTE ON FUNCTION block_seller(UUID, TEXT) TO service_role;

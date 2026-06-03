CREATE OR REPLACE FUNCTION reserve_size_atomic(
  p_product_size_id UUID,
  p_session_id TEXT,
  p_ttl_minutes INTEGER DEFAULT 10
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current INTEGER;
  v_reserved INTEGER;
  v_existing_id UUID;
  v_new_expires TIMESTAMPTZ;
  v_product_id UUID;
BEGIN
  v_new_expires := NOW() + make_interval(mins => p_ttl_minutes);

  SELECT COALESCE(current_quantity, 0), COALESCE(reserved_quantity, 0), product_id
    INTO v_current, v_reserved, v_product_id
    FROM product_sizes
   WHERE id = p_product_size_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_SIZE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_existing_id
    FROM size_reservations
   WHERE product_size_id = p_product_size_id
     AND session_id = p_session_id
   LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    UPDATE size_reservations
       SET expires_at = v_new_expires
     WHERE id = v_existing_id;
    RETURN v_existing_id;
  END IF;

  IF v_current - v_reserved <= 0 THEN
    RAISE EXCEPTION 'OUT_OF_STOCK' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO size_reservations (product_size_id, product_id, session_id, expires_at)
  VALUES (p_product_size_id, v_product_id, p_session_id, v_new_expires)
  RETURNING id INTO v_existing_id;

  UPDATE product_sizes
     SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
   WHERE id = p_product_size_id;

  RETURN v_existing_id;
END;
$$;

GRANT EXECUTE ON FUNCTION reserve_size_atomic(UUID, TEXT, INTEGER) TO service_role;

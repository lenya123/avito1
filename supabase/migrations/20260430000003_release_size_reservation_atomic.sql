-- Atomic снятие soft-резерва конкретной сессии. Используется при
-- checkout:cancel в wizard'е, чтобы не ждать TTL release-reservation job.

CREATE OR REPLACE FUNCTION release_size_reservation_atomic(
  p_product_size_id UUID,
  p_session_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  WITH deleted AS (
    DELETE FROM size_reservations
     WHERE product_size_id = p_product_size_id
       AND session_id = p_session_id
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_deleted FROM deleted;

  IF v_deleted = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE product_sizes
     SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - v_deleted, 0)
   WHERE id = p_product_size_id;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION release_size_reservation_atomic(UUID, TEXT) TO service_role;

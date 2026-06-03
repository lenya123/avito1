-- Атомарное оформление заказа с защитой от двойной продажи.
-- SELECT FOR UPDATE на product_sizes сериализует параллельные транзакции
-- для одной строки. Если у клиента уже есть валидный soft-резерв в
-- size_reservations — он учитывается (не делаем повторный инкремент
-- reserved_quantity). Запись soft-резерва удаляется атомарно с INSERT
-- заказа.

CREATE OR REPLACE FUNCTION create_order_atomic(
  p_product_size_id UUID,
  p_customer_id UUID,
  p_session_id TEXT,
  p_client_price NUMERIC,
  p_purchase_price NUMERIC,
  p_delivery_service TEXT,
  p_tracking_number TEXT,
  p_send_by DATE,
  p_payment_method TEXT DEFAULT NULL,
  p_partner_id UUID DEFAULT NULL,
  p_partner_commission_snapshot NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  order_number INTEGER,
  client_price NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current INTEGER;
  v_reserved INTEGER;
  v_has_reservation BOOLEAN := FALSE;
  v_new_order_id UUID;
  v_new_order_number INTEGER;
BEGIN
  SELECT COALESCE(current_quantity, 0), COALESCE(reserved_quantity, 0)
    INTO v_current, v_reserved
    FROM product_sizes
   WHERE product_sizes.id = p_product_size_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_SIZE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM size_reservations sr
     WHERE sr.product_size_id = p_product_size_id
       AND sr.session_id = p_session_id
       AND sr.expires_at > NOW()
  ) INTO v_has_reservation;

  IF (v_current - v_reserved + CASE WHEN v_has_reservation THEN 1 ELSE 0 END) <= 0 THEN
    RAISE EXCEPTION 'OUT_OF_STOCK' USING ERRCODE = 'P0003';
  END IF;

  INSERT INTO orders (
    product_size_id,
    customer_id,
    client_price,
    purchase_price,
    delivery_service,
    tracking_number,
    send_by,
    status,
    is_paid,
    payment_method,
    partner_id,
    partner_commission_snapshot
  )
  VALUES (
    p_product_size_id,
    p_customer_id,
    p_client_price,
    p_purchase_price,
    p_delivery_service,
    p_tracking_number,
    p_send_by,
    'paid',
    FALSE,
    p_payment_method,
    p_partner_id,
    p_partner_commission_snapshot
  )
  RETURNING orders.id, orders.order_number INTO v_new_order_id, v_new_order_number;

  IF v_has_reservation THEN
    DELETE FROM size_reservations
     WHERE product_size_id = p_product_size_id
       AND session_id = p_session_id;
  ELSE
    UPDATE product_sizes
       SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
     WHERE product_sizes.id = p_product_size_id;
  END IF;

  RETURN QUERY SELECT v_new_order_id, v_new_order_number, p_client_price;
END;
$$;

GRANT EXECUTE ON FUNCTION create_order_atomic(
  UUID, UUID, TEXT, NUMERIC, NUMERIC, TEXT, TEXT, DATE, TEXT, UUID, NUMERIC
) TO service_role;

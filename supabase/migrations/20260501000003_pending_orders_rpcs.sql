-- RPC для атомарного создания/подтверждения/отмены pending_orders.

CREATE OR REPLACE FUNCTION public.create_pending_order_atomic(
  p_customer_id UUID,
  p_product_id UUID,
  p_product_size_id UUID,
  p_partner_id UUID,
  p_client_price NUMERIC,
  p_delivery_service TEXT,
  p_tracking_number TEXT,
  p_send_by DATE,
  p_ttl_minutes INTEGER DEFAULT 10
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_current INTEGER;
  v_reserved INTEGER;
  v_session_reservation_id UUID;
  v_pending_id UUID;
BEGIN
  SELECT COALESCE(current_quantity, 0), COALESCE(reserved_quantity, 0)
    INTO v_current, v_reserved
    FROM public.product_sizes
   WHERE id = p_product_size_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PRODUCT_SIZE_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT id INTO v_session_reservation_id
    FROM public.size_reservations
   WHERE product_size_id = p_product_size_id
     AND session_id = p_customer_id::TEXT
   LIMIT 1;

  IF v_session_reservation_id IS NOT NULL THEN
    DELETE FROM public.size_reservations WHERE id = v_session_reservation_id;
  ELSE
    IF v_current - v_reserved <= 0 THEN
      RAISE EXCEPTION 'OUT_OF_STOCK' USING ERRCODE = 'P0003';
    END IF;
    UPDATE public.product_sizes
       SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
     WHERE id = p_product_size_id;
  END IF;

  INSERT INTO public.pending_orders (
    customer_id, product_id, product_size_id, partner_id,
    client_price, delivery_service, tracking_number, send_by,
    expires_at
  ) VALUES (
    p_customer_id, p_product_id, p_product_size_id, p_partner_id,
    p_client_price, p_delivery_service, p_tracking_number, p_send_by,
    NOW() + make_interval(mins => p_ttl_minutes)
  )
  RETURNING id INTO v_pending_id;

  RETURN v_pending_id;
END;
$func$;

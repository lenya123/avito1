-- Часть 2/2: новая create_pending_order_atomic с RETURNS TABLE
-- (pending_id, applied_balance, fully_paid_by_balance).
--
-- Этап 3 walkthrough:
--   1. SELECT FOR UPDATE customer (защита от parallel-оформления).
--   2. balance_to_apply = LEAST(customer_balance, p_client_price).
--   3. DEC customer_balance, INSERT customer_balance_history reason='balance_apply'.
--   4. INSERT pending с applied_balance.
--
-- Если applied_balance == p_client_price → fully_paid_by_balance=TRUE.
-- Вызывающий код в этом случае сразу confirm_pending_order_atomic, без чека.

CREATE FUNCTION public.create_pending_order_atomic(
  p_customer_id UUID,
  p_product_id UUID,
  p_product_size_id UUID,
  p_client_price NUMERIC,
  p_delivery_service TEXT,
  p_tracking_number TEXT,
  p_send_by DATE,
  p_partner_id UUID DEFAULT NULL,
  p_ttl_minutes INTEGER DEFAULT 10
)
RETURNS TABLE (
  pending_id UUID,
  applied_balance NUMERIC,
  fully_paid_by_balance BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_current INTEGER;
  v_reserved INTEGER;
  v_session_reservation_id UUID;
  v_pending_id UUID;
  v_balance NUMERIC;
  v_applied NUMERIC := 0;
  v_remaining NUMERIC;
  v_fully_paid BOOLEAN := FALSE;
  v_now TIMESTAMPTZ := NOW();
  v_new_balance NUMERIC;
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

  -- Применяем баланс ТОЛЬКО для не-партнёрских заказов.
  IF p_partner_id IS NULL THEN
    SELECT customer_balance INTO v_balance
      FROM public.customers
     WHERE id = p_customer_id
     FOR UPDATE;

    IF v_balance > 0 THEN
      v_applied := LEAST(v_balance, p_client_price);
      v_remaining := p_client_price - v_applied;
      v_fully_paid := v_remaining <= 0;

      UPDATE public.customers
         SET customer_balance = customer_balance - v_applied
       WHERE id = p_customer_id
       RETURNING customer_balance INTO v_new_balance;

      INSERT INTO public.customer_balance_history (
        customer_id, delta, balance_after, reason, created_at
      ) VALUES (
        p_customer_id, -v_applied, v_new_balance, 'balance_apply', v_now
      );
    END IF;
  END IF;

  INSERT INTO public.pending_orders (
    customer_id, product_id, product_size_id, partner_id,
    client_price, delivery_service, tracking_number, send_by,
    expires_at, applied_balance
  ) VALUES (
    p_customer_id, p_product_id, p_product_size_id, p_partner_id,
    p_client_price, p_delivery_service, p_tracking_number, p_send_by,
    NOW() + make_interval(mins => p_ttl_minutes),
    v_applied
  )
  RETURNING id INTO v_pending_id;

  RETURN QUERY SELECT v_pending_id, v_applied, v_fully_paid;
END;
$func$;

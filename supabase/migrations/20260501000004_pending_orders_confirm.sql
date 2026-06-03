CREATE OR REPLACE FUNCTION public.confirm_pending_order_atomic(
  p_pending_order_id UUID,
  p_payment_method TEXT DEFAULT 'card'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_pending RECORD;
  v_order_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_pending
    FROM public.pending_orders
   WHERE id = p_pending_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.orders (
    customer_id, product_id, product_size_id, partner_id,
    client_price, delivery_service, tracking_number, send_by,
    status, is_paid, paid_at, payment_method,
    status_history,
    created_at
  ) VALUES (
    v_pending.customer_id, v_pending.product_id, v_pending.product_size_id, v_pending.partner_id,
    v_pending.client_price, v_pending.delivery_service, v_pending.tracking_number, v_pending.send_by,
    'paid', TRUE, v_now, p_payment_method,
    jsonb_build_array(jsonb_build_object('status', 'paid', 'at', v_now)),
    v_now
  )
  RETURNING id INTO v_order_id;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN v_order_id;
END;
$func$;

-- Confirm RPC v2: тащим purchase_price + partner_commission из products
-- (они в pending_orders не хранятся — снимок берётся в момент подтверждения оплаты).

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
  v_purchase_price NUMERIC;
  v_partner_commission NUMERIC;
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

  SELECT purchase_price, partner_commission
    INTO v_purchase_price, v_partner_commission
    FROM public.products
   WHERE id = v_pending.product_id;

  INSERT INTO public.orders (
    customer_id, product_id, product_size_id, partner_id,
    client_price, purchase_price, partner_commission_snapshot,
    delivery_service, tracking_number, send_by,
    status, is_paid, paid_at, payment_method,
    status_history,
    created_at
  ) VALUES (
    v_pending.customer_id, v_pending.product_id, v_pending.product_size_id, v_pending.partner_id,
    v_pending.client_price, COALESCE(v_purchase_price, 0), v_partner_commission,
    v_pending.delivery_service, v_pending.tracking_number, v_pending.send_by,
    'paid', TRUE, v_now, p_payment_method,
    jsonb_build_array(jsonb_build_object('status', 'paid', 'at', v_now)),
    v_now
  )
  RETURNING id INTO v_order_id;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN v_order_id;
END;
$func$;

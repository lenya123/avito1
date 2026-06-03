-- Симметрия учёта склада, часть 2/4: confirm_pending_order_atomic.
-- При confirm-е pending'а (Vision auto / директор / партнёр / owner-API)
-- бронь конвертируется в продажу: DEC current_quantity и DEC reserved_quantity
-- атомарно с INSERT'ом orders и DELETE'ом pending.

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
    order_number,
    client_price, purchase_price, partner_commission_snapshot,
    delivery_service, tracking_number, send_by,
    status, is_paid, paid_at, payment_method,
    status_history,
    created_at
  ) VALUES (
    v_pending.customer_id, v_pending.product_id, v_pending.product_size_id, v_pending.partner_id,
    v_pending.order_number,
    v_pending.client_price, COALESCE(v_purchase_price, 0), v_partner_commission,
    v_pending.delivery_service, v_pending.tracking_number, v_pending.send_by,
    'paid', TRUE, v_now, p_payment_method,
    jsonb_build_array(jsonb_build_object('status', 'paid', 'at', v_now)),
    v_now
  )
  RETURNING id INTO v_order_id;

  UPDATE public.product_sizes
     SET current_quantity = GREATEST(COALESCE(current_quantity, 0) - 1, 0),
         reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0),
         updated_at = NOW()
   WHERE id = v_pending.product_size_id;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN v_order_id;
END;
$func$;

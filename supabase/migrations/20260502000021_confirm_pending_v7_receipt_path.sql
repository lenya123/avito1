-- confirm_pending_order_atomic v7: копирует receipt_storage_path в orders.
-- Нужно для replay-проверки: при подозрении на повторно использованный
-- чек директору шлём оригинал (по этому пути) + новый чек для сравнения.

CREATE OR REPLACE FUNCTION public.confirm_pending_order_atomic(
  p_pending_order_id UUID,
  p_payment_method TEXT DEFAULT 'card',
  p_confirmed_by TEXT DEFAULT 'director'
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
    created_at,
    vision_operation_id,
    vision_recipient_card_last4,
    vision_recipient_phone,
    vision_recipient_ip_name,
    vision_amount,
    vision_raw_text,
    confirmed_by,
    applied_balance,
    receipt_storage_path
  ) VALUES (
    v_pending.customer_id, v_pending.product_id, v_pending.product_size_id, v_pending.partner_id,
    v_pending.order_number,
    v_pending.client_price, COALESCE(v_purchase_price, 0), v_partner_commission,
    v_pending.delivery_service, v_pending.tracking_number, v_pending.send_by,
    'paid', TRUE, v_now, p_payment_method,
    jsonb_build_array(jsonb_build_object('status', 'paid', 'at', v_now)),
    v_now,
    v_pending.vision_operation_id,
    v_pending.vision_recipient_card_last4,
    v_pending.vision_recipient_phone,
    v_pending.vision_recipient_ip_name,
    v_pending.vision_amount,
    v_pending.vision_raw_text,
    p_confirmed_by,
    COALESCE(v_pending.applied_balance, 0),
    v_pending.receipt_storage_path
  )
  RETURNING id INTO v_order_id;

  UPDATE public.product_sizes
     SET current_quantity = GREATEST(COALESCE(current_quantity, 0) - 1, 0),
         reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
   WHERE id = v_pending.product_size_id;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN v_order_id;
END;
$func$;

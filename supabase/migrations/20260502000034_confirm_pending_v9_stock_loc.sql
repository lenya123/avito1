-- confirm_pending_order_atomic v9:
--   1. Копирует partner_stock_location из pending в orders.
--   2. Бамп payment_method_month_stats теперь по `payment_method_id IS NOT NULL`
--      (а не по `partner_id IS NULL`) — так корректно бампим для
--      owner_warehouse партнёрских заказов: они идут через owner's методы.

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
  v_amount_to_bump NUMERIC;
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
    receipt_storage_path,
    payment_method_id,
    partner_stock_location
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
    v_pending.receipt_storage_path,
    v_pending.payment_method_id,
    v_pending.partner_stock_location
  )
  RETURNING id INTO v_order_id;

  UPDATE public.product_sizes
     SET current_quantity = GREATEST(COALESCE(current_quantity, 0) - 1, 0),
         reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
   WHERE id = v_pending.product_size_id;

  -- Бамп месячной статистики метода. Условие: метод привязан к pending'у.
  -- Это ловит и не-партнёрские (всегда), и owner_warehouse-партнёрские
  -- (платежи идут владельцу). partner_warehouse-партнёрские → метод
  -- не привязан, бампа нет (деньги идут партнёру).
  IF v_pending.payment_method_id IS NOT NULL THEN
    v_amount_to_bump := GREATEST(
      0,
      COALESCE(v_pending.client_price, 0) - COALESCE(v_pending.applied_balance, 0)
    );
    IF v_amount_to_bump > 0 THEN
      INSERT INTO public.payment_method_month_stats (
        payment_method_id, year_month, amount_used, updated_at
      ) VALUES (
        v_pending.payment_method_id, to_char(v_now, 'YYYY-MM'), v_amount_to_bump, v_now
      )
      ON CONFLICT (payment_method_id, year_month)
      DO UPDATE SET amount_used = public.payment_method_month_stats.amount_used + EXCLUDED.amount_used,
                    updated_at = v_now;
    END IF;
  END IF;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN v_order_id;
END;
$func$;

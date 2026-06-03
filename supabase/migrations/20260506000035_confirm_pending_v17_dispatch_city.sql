-- confirm_pending_order_atomic v17: копирует dispatch_city из pending в orders.

CREATE OR REPLACE FUNCTION public.confirm_pending_order_atomic(
  p_pending_order_id UUID,
  p_payment_method   TEXT DEFAULT 'card',
  p_confirmed_by     TEXT DEFAULT 'director'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_pending             RECORD;
  v_purchase_price      NUMERIC;
  v_partner_commission  NUMERIC;
  v_size_text           TEXT;
  v_order_id            UUID;
  v_now                 TIMESTAMPTZ := NOW();
  v_amount_to_bump      NUMERIC;
  v_is_paid             BOOLEAN;
  v_paid_at             TIMESTAMPTZ;
  v_payment_method      TEXT;
  v_fully_paid_balance  BOOLEAN;
BEGIN
  SELECT * INTO v_pending
    FROM public.pending_orders
   WHERE id = p_pending_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT purchase_price INTO v_purchase_price
    FROM public.products
   WHERE id = v_pending.product_id;

  IF v_pending.source_kind = 'partner' AND v_pending.source_binding_id IS NOT NULL THEN
    SELECT commission INTO v_partner_commission
      FROM public.product_partner_bindings
     WHERE id = v_pending.source_binding_id;
  ELSE
    v_partner_commission := NULL;
  END IF;

  SELECT size INTO v_size_text
    FROM public.product_sizes
   WHERE id = v_pending.product_size_id;

  v_fully_paid_balance := COALESCE(v_pending.applied_balance, 0) >= COALESCE(v_pending.client_price, 0)
                          AND COALESCE(v_pending.client_price, 0) > 0;

  IF COALESCE(v_pending.is_vibe_debt, FALSE) AND NOT v_fully_paid_balance THEN
    v_is_paid        := FALSE;
    v_paid_at        := NULL;
    v_payment_method := 'deposit';
  ELSIF v_fully_paid_balance THEN
    v_is_paid        := TRUE;
    v_paid_at        := v_now;
    v_payment_method := 'balance';
  ELSE
    v_is_paid        := TRUE;
    v_paid_at        := v_now;
    v_payment_method := p_payment_method;
  END IF;

  INSERT INTO public.orders (
    customer_id, product_id, product_size_id, partner_id,
    order_number,
    size,
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
    source_kind,
    source_binding_id,
    source_partner_id,
    source_warehouse,
    dispatch_city
  ) VALUES (
    v_pending.customer_id, v_pending.product_id, v_pending.product_size_id, v_pending.partner_id,
    v_pending.order_number,
    v_size_text,
    v_pending.client_price, COALESCE(v_purchase_price, 0), v_partner_commission,
    v_pending.delivery_service, v_pending.tracking_number, v_pending.send_by,
    'paid', v_is_paid, v_paid_at, v_payment_method,
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
    v_pending.source_kind,
    v_pending.source_binding_id,
    v_pending.source_partner_id,
    v_pending.source_warehouse,
    v_pending.dispatch_city
  )
  RETURNING id INTO v_order_id;

  IF v_pending.source_kind = 'partner'
     AND v_pending.source_binding_id IS NOT NULL
     AND v_size_text IS NOT NULL
  THEN
    UPDATE public.product_partner_size_stock
       SET current_quantity  = GREATEST(COALESCE(current_quantity, 0) - 1, 0),
           reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
     WHERE binding_id = v_pending.source_binding_id
       AND size = v_size_text;
  ELSE
    UPDATE public.product_sizes
       SET current_quantity  = GREATEST(COALESCE(current_quantity, 0) - 1, 0),
           reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
     WHERE id = v_pending.product_size_id;
  END IF;

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
      DO UPDATE SET
        amount_used = public.payment_method_month_stats.amount_used + EXCLUDED.amount_used,
        updated_at  = v_now;
    END IF;
  END IF;

  IF v_pending.source_kind = 'partner'
     AND v_pending.source_partner_id IS NOT NULL
     AND COALESCE(v_partner_commission, 0) > 0
     AND NOT COALESCE(v_pending.is_vibe_debt, FALSE)
  THEN
    INSERT INTO public.partner_owner_debts (
      partner_id, order_id, amount, reason, created_at
    ) VALUES (
      v_pending.source_partner_id, v_order_id, v_partner_commission,
      'partner_commission', v_now
    );
  END IF;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN v_order_id;
END;
$func$;

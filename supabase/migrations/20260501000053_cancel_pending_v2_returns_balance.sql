-- cancel_pending_order_atomic v2 (Этап 3): при cancel pending'а возвращает
-- applied_balance на баланс клиента (через INSERT customer_balance_history
-- reason='balance_return') + DEC reserved_quantity (как раньше).

CREATE OR REPLACE FUNCTION public.cancel_pending_order_atomic(p_pending_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_pending RECORD;
  v_new_balance NUMERIC;
BEGIN
  SELECT id, customer_id, product_size_id, applied_balance
    INTO v_pending
    FROM public.pending_orders
   WHERE id = p_pending_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Возвращаем applied_balance на customer_balance (если был).
  IF COALESCE(v_pending.applied_balance, 0) > 0 AND v_pending.customer_id IS NOT NULL THEN
    UPDATE public.customers
       SET customer_balance = customer_balance + v_pending.applied_balance
     WHERE id = v_pending.customer_id
     RETURNING customer_balance INTO v_new_balance;

    INSERT INTO public.customer_balance_history (
      customer_id, delta, balance_after, reason, created_at
    ) VALUES (
      v_pending.customer_id,
      v_pending.applied_balance,
      v_new_balance,
      'balance_return',
      NOW()
    );
  END IF;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  UPDATE public.product_sizes
     SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - 1)
   WHERE id = v_pending.product_size_id;

  RETURN TRUE;
END;
$func$;

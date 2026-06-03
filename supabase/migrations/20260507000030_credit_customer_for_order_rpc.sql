-- ============================================================================
-- credit_customer_for_order — атомарный auto-credit customer_balance
-- ============================================================================
-- BUSINESS_LOGIC §9.2: при `return_done`, `cancelled_before_ship`,
-- `send_by_expired` (если заказ был оплачен) деньги возвращаются клиенту на
-- customer_balance. Phase F автоматизация: вызывается из card-actions
-- (отмена клиентом) и shipper-actions (приём возврата).
--
-- Идемпотентна: повторный вызов с тем же (order_id, reason) — no-op,
-- возвращает текущий balance. Защищает от ретраев и двойных вызовов.

CREATE OR REPLACE FUNCTION public.credit_customer_for_order(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_order_id UUID,
  p_reason TEXT
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_after NUMERIC(12, 2);
  v_already_credited BOOLEAN;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
  END IF;
  IF p_reason NOT IN ('return_done', 'cancelled_before_ship', 'send_by_expired') THEN
    RAISE EXCEPTION 'Unsupported auto-credit reason: %', p_reason USING ERRCODE = '22023';
  END IF;

  -- Идемпотентность: одна история на (order_id, reason).
  SELECT EXISTS (
    SELECT 1 FROM public.customer_balance_history
    WHERE order_id = p_order_id AND reason = p_reason
  ) INTO v_already_credited;

  IF v_already_credited THEN
    SELECT customer_balance INTO v_balance_after
      FROM public.customers WHERE id = p_customer_id;
    RETURN COALESCE(v_balance_after, 0);
  END IF;

  UPDATE public.customers
    SET customer_balance = customer_balance + p_amount
    WHERE id = p_customer_id
    RETURNING customer_balance INTO v_balance_after;

  IF v_balance_after IS NULL THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.customer_balance_history (
    customer_id,
    delta,
    balance_after,
    reason,
    order_id
  ) VALUES (
    p_customer_id,
    p_amount,
    v_balance_after,
    p_reason,
    p_order_id
  );

  RETURN v_balance_after;
END $$;

GRANT EXECUTE ON FUNCTION public.credit_customer_for_order(UUID, NUMERIC, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.credit_customer_for_order IS
  'Phase F: auto-credit customer_balance при return_done / cancelled_before_ship / send_by_expired. Идемпотентна по (order_id, reason).';

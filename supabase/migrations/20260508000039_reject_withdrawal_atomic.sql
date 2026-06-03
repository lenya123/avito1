-- Walkthrough #5: владелец пишет «N нет» — отказ в выводе. Запрос помечается
-- cancelled (с processed_by владельца — отличается от self-cancel клиентом),
-- сумма возвращается на баланс, history с reason='withdrawal_rejected'.
CREATE OR REPLACE FUNCTION public.reject_withdrawal_atomic(
  p_request_id UUID,
  p_processed_by UUID
) RETURNS TABLE (
  out_customer_id UUID,
  out_number INTEGER,
  out_amount NUMERIC,
  out_balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_balance_after NUMERIC(12, 2);
BEGIN
  UPDATE public.withdrawal_requests
    SET status = 'cancelled',
        processed_at = NOW(),
        processed_by = p_processed_by
    WHERE id = p_request_id
      AND status = 'pending'
    RETURNING customer_id, amount, withdrawal_number INTO v_request;

  IF v_request.customer_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request % not found or not pending', p_request_id
      USING ERRCODE = 'P0002';
  END IF;

  PERFORM 1 FROM public.customers WHERE id = v_request.customer_id FOR UPDATE;

  UPDATE public.customers
    SET customer_balance = customer_balance + v_request.amount
    WHERE id = v_request.customer_id
    RETURNING customer_balance INTO v_balance_after;

  INSERT INTO public.customer_balance_history (
    customer_id,
    delta,
    balance_after,
    reason,
    withdrawal_request_id,
    actor_user_id
  ) VALUES (
    v_request.customer_id,
    v_request.amount,
    v_balance_after,
    'withdrawal_rejected',
    p_request_id,
    p_processed_by
  );

  out_customer_id := v_request.customer_id;
  out_number := v_request.withdrawal_number;
  out_amount := v_request.amount;
  out_balance_after := v_balance_after;
  RETURN NEXT;
END $$;

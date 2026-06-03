-- Walkthrough #5: клиент отменяет свой pending-запрос.
-- Помечает cancelled, возвращает amount на customer_balance, пишет history.
CREATE OR REPLACE FUNCTION public.cancel_withdrawal_atomic(
  p_request_id UUID,
  p_customer_id UUID
) RETURNS TABLE (
  out_amount NUMERIC,
  out_balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount NUMERIC(12, 2);
  v_balance_after NUMERIC(12, 2);
BEGIN
  UPDATE public.withdrawal_requests
    SET status = 'cancelled',
        processed_at = NOW()
    WHERE id = p_request_id
      AND customer_id = p_customer_id
      AND status = 'pending'
    RETURNING amount INTO v_amount;

  IF v_amount IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request % not pending or wrong customer', p_request_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.customers
    SET customer_balance = customer_balance + v_amount
    WHERE id = p_customer_id
    RETURNING customer_balance INTO v_balance_after;

  INSERT INTO public.customer_balance_history (
    customer_id,
    delta,
    balance_after,
    reason,
    withdrawal_request_id
  ) VALUES (
    p_customer_id,
    v_amount,
    v_balance_after,
    'withdrawal_cancel',
    p_request_id
  );

  out_amount := v_amount;
  out_balance_after := v_balance_after;
  RETURN NEXT;
END $$;

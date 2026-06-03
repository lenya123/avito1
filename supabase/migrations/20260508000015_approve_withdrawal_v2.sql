-- Walkthrough #5: refactor approve_withdrawal_request — теперь только помечает
-- запрос done. Баланс зарезервирован при создании в request_withdrawal_atomic.
-- Сохранён return-shape для совместимости с owner-bot handler'ом.
CREATE OR REPLACE FUNCTION public.approve_withdrawal_request(
  p_request_id UUID,
  p_processed_by UUID
) RETURNS TABLE (
  out_customer_id UUID,
  out_amount NUMERIC,
  out_balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request RECORD;
  v_balance NUMERIC(12, 2);
BEGIN
  UPDATE public.withdrawal_requests
    SET status = 'done',
        processed_at = NOW(),
        processed_by = p_processed_by
    WHERE id = p_request_id
      AND status = 'pending'
    RETURNING customer_id, amount INTO v_request;

  IF v_request.customer_id IS NULL THEN
    RAISE EXCEPTION 'Withdrawal request % not found or not pending', p_request_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT customer_balance INTO v_balance
  FROM public.customers
  WHERE id = v_request.customer_id;

  out_customer_id := v_request.customer_id;
  out_amount := v_request.amount;
  out_balance_after := v_balance;
  RETURN NEXT;
END $$;

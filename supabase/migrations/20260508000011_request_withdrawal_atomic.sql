-- Walkthrough #5: атомарное создание запроса на вывод с резервированием баланса.
-- Lock customer + INSERT request + DEC balance + INSERT history в одной транзакции.
-- Дубль pending кидает 23505 (UNIQUE на withdrawal_requests).
CREATE OR REPLACE FUNCTION public.request_withdrawal_atomic(
  p_customer_id UUID
) RETURNS TABLE (
  out_request_id UUID,
  out_amount NUMERIC,
  out_balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance NUMERIC(12, 2);
  v_request_id UUID;
  v_balance_after NUMERIC(12, 2);
BEGIN
  SELECT customer_balance INTO v_balance
  FROM public.customers
  WHERE id = p_customer_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  IF v_balance <= 0 THEN
    RAISE EXCEPTION 'Customer balance is zero or negative' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.withdrawal_requests (customer_id, amount, status)
  VALUES (p_customer_id, v_balance, 'pending')
  RETURNING id INTO v_request_id;

  UPDATE public.customers
    SET customer_balance = customer_balance - v_balance
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
    -v_balance,
    v_balance_after,
    'withdrawal_request',
    v_request_id
  );

  out_request_id := v_request_id;
  out_amount := v_balance;
  out_balance_after := v_balance_after;
  RETURN NEXT;
END $$;

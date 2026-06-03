-- v2: добавлен out_number. Сохраняет FOR UPDATE на customer и семантику
-- self-cancel клиентом — pending → cancelled, баланс возвращается, history
-- с reason='withdrawal_cancel' (отличается от 'withdrawal_rejected', который
-- пишется при отказе владельца).
CREATE FUNCTION public.cancel_withdrawal_atomic(
  p_request_id UUID,
  p_customer_id UUID
) RETURNS TABLE (
  out_number INTEGER,
  out_amount NUMERIC,
  out_balance_after NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_amount NUMERIC(12, 2);
  v_number INTEGER;
  v_balance_after NUMERIC(12, 2);
BEGIN
  PERFORM 1 FROM public.customers WHERE id = p_customer_id FOR UPDATE;

  UPDATE public.withdrawal_requests
    SET status = 'cancelled',
        processed_at = NOW()
    WHERE id = p_request_id
      AND customer_id = p_customer_id
      AND status = 'pending'
    RETURNING amount, withdrawal_number INTO v_amount, v_number;

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

  out_number := v_number;
  out_amount := v_amount;
  out_balance_after := v_balance_after;
  RETURN NEXT;
END $$;

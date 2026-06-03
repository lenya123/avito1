-- Phase F.3 — RPC approve_withdrawal_request: атомарное списание баланса
-- по pending withdrawal_requests + запись в customer_balance_history.
--
-- Используется из owner-bot: владелец нажимает «✅ Списать» в DM-уведомлении
-- после фактического перевода денег вне бота.
--
-- Возвращает обновлённый balance_after для DM-уведомления клиенту.

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
  v_balance_after NUMERIC(12, 2);
BEGIN
  -- 1. Помечаем запрос done (с optimistic-lock на pending).
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

  -- 2. Списываем баланс. CHECK customers_balance_non_negative защитит от ухода в минус.
  UPDATE public.customers
    SET customer_balance = customer_balance - v_request.amount
    WHERE id = v_request.customer_id
    RETURNING customer_balance INTO v_balance_after;

  -- 3. История движений.
  INSERT INTO public.customer_balance_history (
    customer_id,
    delta,
    balance_after,
    reason,
    withdrawal_request_id,
    actor_user_id
  ) VALUES (
    v_request.customer_id,
    -v_request.amount,
    v_balance_after,
    'withdrawal',
    p_request_id,
    p_processed_by
  );

  out_customer_id := v_request.customer_id;
  out_amount := v_request.amount;
  out_balance_after := v_balance_after;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.approve_withdrawal_request(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.approve_withdrawal_request IS
  'BUSINESS_LOGIC §9.2: атомарное «Списать с баланса» — UPDATE withdrawal_requests=done + UPDATE customers.customer_balance + INSERT customer_balance_history. Raises P0002 если запрос не pending.';

-- Также: RPC для ручного «Вернуть N₽ клиенту» (manual_credit).
-- Используется владельцем из owner-панели/owner-bot для произвольного возврата.

CREATE OR REPLACE FUNCTION public.manual_credit_customer(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_actor_user_id UUID,
  p_order_id UUID DEFAULT NULL,
  p_note TEXT DEFAULT NULL
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance_after NUMERIC(12, 2);
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive' USING ERRCODE = '22023';
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
    order_id,
    actor_user_id,
    note
  ) VALUES (
    p_customer_id,
    p_amount,
    v_balance_after,
    'manual_credit',
    p_order_id,
    p_actor_user_id,
    p_note
  );

  RETURN v_balance_after;
END $$;

GRANT EXECUTE ON FUNCTION public.manual_credit_customer(UUID, NUMERIC, UUID, UUID, TEXT) TO service_role;

COMMENT ON FUNCTION public.manual_credit_customer IS
  'BUSINESS_LOGIC §9.2 «Вернуть N₽ клиенту»: ручное пополнение customer_balance владельцем (например, по заявке клиента после trash-возврата). Пишет историю с reason=manual_credit.';

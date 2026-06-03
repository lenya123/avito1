-- ============================================================================
-- apply_manual_balance_adjustment — ручная корректировка customer_balance
-- ============================================================================
-- Walkthrough фазы 2 (/owner/clients/[id]): «единая функция управления
-- балансом клиента» — кнопки ➕ Пополнить / ➖ Списать в карточке клиента.
-- Атомарно: UPDATE customer_balance + INSERT в customer_balance_history.
--
-- p_delta: положительная для пополнения (reason='manual_credit'),
--          отрицательная для списания (reason='manual_debit').
-- p_note:  обязательный комментарий (UI требует, RPC валидирует).
-- p_actor_user_id: id владельца который инициировал; идёт в history.actor_user_id.
--
-- Защита от ухода в минус — через CHECK balance_after >= 0 на таблице
-- customer_balance_history (она кинет 23514). RPC просто пробрасывает.

CREATE OR REPLACE FUNCTION public.apply_manual_balance_adjustment(
  p_customer_id UUID,
  p_delta NUMERIC,
  p_note TEXT,
  p_actor_user_id UUID
) RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance_after NUMERIC(12, 2);
  v_reason TEXT;
BEGIN
  IF p_delta = 0 THEN
    RAISE EXCEPTION 'Delta must be non-zero' USING ERRCODE = '22023';
  END IF;
  IF p_note IS NULL OR length(trim(p_note)) = 0 THEN
    RAISE EXCEPTION 'Note is required for manual balance adjustment' USING ERRCODE = '22023';
  END IF;

  v_reason := CASE WHEN p_delta > 0 THEN 'manual_credit' ELSE 'manual_debit' END;

  UPDATE public.customers
    SET customer_balance = customer_balance + p_delta
    WHERE id = p_customer_id
    RETURNING customer_balance INTO v_balance_after;

  IF v_balance_after IS NULL THEN
    RAISE EXCEPTION 'Customer % not found', p_customer_id USING ERRCODE = 'P0002';
  END IF;

  -- balance_after CHECK (>= 0) на таблице кинет 23514 если ушли в минус.
  INSERT INTO public.customer_balance_history (
    customer_id,
    delta,
    balance_after,
    reason,
    actor_user_id,
    note
  ) VALUES (
    p_customer_id,
    p_delta,
    v_balance_after,
    v_reason,
    p_actor_user_id,
    p_note
  );

  RETURN v_balance_after;
END $$;

GRANT EXECUTE ON FUNCTION public.apply_manual_balance_adjustment(UUID, NUMERIC, TEXT, UUID) TO service_role;

COMMENT ON FUNCTION public.apply_manual_balance_adjustment IS
  'Walkthrough фазы 2: ручная корректировка customer_balance владельцем (➕/➖ кнопки в /owner/clients/[id]). Атомарна, требует note, защищена от минуса через CHECK balance_after.';

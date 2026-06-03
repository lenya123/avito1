-- cancel_pending_order_atomic v5 (2026-05-26): убран INSERT в partner_owner_debts.
-- Compensation-flow (size_out_money_received / product_out_money_received) был
-- выпилен в G.5 (см. partner-bot.ts — handlePartnerMoneyYes/No, partner-reject
-- callbacks). Параметры p_record_partner_debt / p_partner_debt_reason оставлены
-- в сигнатуре для backward compat — они теперь no-op (никто не вызывает с TRUE).
--
-- Остальная семантика v4 (возврат applied_balance, автокредит client_price,
-- zero_out_source / простое снятие резерва) сохранена.

CREATE OR REPLACE FUNCTION public.cancel_pending_order_atomic(
  p_pending_order_id        UUID,
  p_credit_full_to_balance  BOOLEAN DEFAULT FALSE,
  p_record_partner_debt     BOOLEAN DEFAULT FALSE,
  p_zero_out_source         BOOLEAN DEFAULT FALSE,
  p_partner_debt_reason     TEXT    DEFAULT 'size_out_money_received'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_pending     RECORD;
  v_size_text   TEXT;
  v_new_balance NUMERIC;
  v_now         TIMESTAMPTZ := NOW();
BEGIN
  -- p_record_partner_debt / p_partner_debt_reason оставлены для совместимости
  -- сигнатуры — не используются (compensation-flow выпилен в G.5).
  PERFORM p_record_partner_debt, p_partner_debt_reason;

  SELECT * INTO v_pending
    FROM public.pending_orders
   WHERE id = p_pending_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Возврат applied_balance (если был).
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
      v_now
    );
  END IF;

  -- Автокредит client_price на баланс (для legacy-callers, если есть).
  IF p_credit_full_to_balance AND COALESCE(v_pending.client_price, 0) > 0
     AND v_pending.customer_id IS NOT NULL
  THEN
    UPDATE public.customers
       SET customer_balance = customer_balance + v_pending.client_price
     WHERE id = v_pending.customer_id
     RETURNING customer_balance INTO v_new_balance;

    INSERT INTO public.customer_balance_history (
      customer_id, delta, balance_after, reason, created_at
    ) VALUES (
      v_pending.customer_id,
      v_pending.client_price,
      v_new_balance,
      'partner_refund_credit',
      v_now
    );
  END IF;

  -- v4→v5: блок INSERT INTO partner_owner_debts удалён (compensation-flow
  -- выпилен в G.5).

  -- Размер текстом — для DEC reserved у partner-источника и для обнуления.
  SELECT size INTO v_size_text
    FROM public.product_sizes
   WHERE id = v_pending.product_size_id;

  -- Обнуление current_quantity И reserved_quantity у источника (size_out / product_out).
  IF p_zero_out_source THEN
    IF v_pending.source_kind = 'partner'
       AND v_pending.source_binding_id IS NOT NULL
       AND v_size_text IS NOT NULL
    THEN
      UPDATE public.product_partner_size_stock
         SET current_quantity = 0,
             reserved_quantity = 0
       WHERE binding_id = v_pending.source_binding_id
         AND size = v_size_text;
    ELSE
      UPDATE public.product_sizes
         SET current_quantity = 0,
             reserved_quantity = 0
       WHERE id = v_pending.product_size_id;
    END IF;
  ELSE
    -- Без zero_out — обычное снятие резерва текущего pending'а.
    IF v_pending.source_kind = 'partner'
       AND v_pending.source_binding_id IS NOT NULL
       AND v_size_text IS NOT NULL
    THEN
      UPDATE public.product_partner_size_stock
         SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
       WHERE binding_id = v_pending.source_binding_id
         AND size = v_size_text;
    ELSE
      UPDATE public.product_sizes
         SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
       WHERE id = v_pending.product_size_id;
    END IF;
  END IF;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN TRUE;
END;
$func$;

-- cancel_pending_order_atomic v3: source-aware DEC reserved + опциональный автокредит/долг партнёра.
--
-- Параметры:
--   p_credit_full_to_balance — credit на customer_balance суммы client_price (reason=partner_refund_credit).
--                              Используется когда партнёр сказал «деньги пришли, но размер/товар закончился».
--   p_record_partner_debt    — INSERT в partner_owner_debts (партнёр должен владельцу).
--   p_zero_out_source        — обнулить current_quantity у источника (size_out / product_out → 0).
--   p_partner_debt_reason    — для INSERT в partner_owner_debts: 'size_out_money_received' или
--                              'product_out_money_received'.
--
-- Старая логика (возврат applied_balance) — всегда. Новые флаги — опциональны.

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
  SELECT * INTO v_pending
    FROM public.pending_orders
   WHERE id = p_pending_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Возврат applied_balance (если был) — старая семантика.
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

  -- Автокредит client_price на баланс — для случая «партнёр получил деньги но размер закончился».
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

  -- Долг партнёра перед владельцем — для того же случая.
  IF p_record_partner_debt AND v_pending.source_kind = 'partner'
     AND v_pending.source_partner_id IS NOT NULL
  THEN
    INSERT INTO public.partner_owner_debts (
      partner_id, order_id, pending_id, amount, reason, created_at
    ) VALUES (
      v_pending.source_partner_id,
      NULL,
      v_pending.id,
      v_pending.client_price,
      p_partner_debt_reason,
      v_now
    );
  END IF;

  -- Размер текстом — для DEC reserved у partner-источника и для обнуления.
  SELECT size INTO v_size_text
    FROM public.product_sizes
   WHERE id = v_pending.product_size_id;

  -- Обнуление current_quantity у источника (size_out / product_out).
  IF p_zero_out_source THEN
    IF v_pending.source_kind = 'partner'
       AND v_pending.source_binding_id IS NOT NULL
       AND v_size_text IS NOT NULL
    THEN
      UPDATE public.product_partner_size_stock
         SET current_quantity = 0
       WHERE binding_id = v_pending.source_binding_id
         AND size = v_size_text;
    ELSE
      -- owner-source: обнуляем product_sizes.current_quantity (теоретически
      -- partner-bot не должен прийти с owner-source, но защита).
      UPDATE public.product_sizes
         SET current_quantity = 0
       WHERE id = v_pending.product_size_id;
    END IF;
  END IF;

  -- DEC reserved правильного источника.
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

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  RETURN TRUE;
END;
$func$;

-- Триггер check_vibe_credit_freeze v3: новая логика разморозки на основе
-- snapshot+threshold.
--
-- Раньше:
--   - vibe_revoked_with_debt → разморозка при debt <= 0.
--   - auto_limit_exceeded    → разморозка при debt <= limit.
--
-- Теперь все ручные заморозки (manual / vibe_revoked_with_debt) —
-- единый механизм через snapshot+threshold:
--   разморозка когда (frozen_debt_snapshot - current_debt) >= required_payment_amount,
--   ИЛИ когда current_debt <= 0 (always — клиент честно всё оплатил).
--
-- Для auto_limit_exceeded остаётся старая логика debt <= limit (там нет
-- порога — это автоматическая защита по лимиту).

CREATE OR REPLACE FUNCTION public.check_vibe_credit_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id        UUID;
  v_debt               NUMERIC(12, 2);
  v_limit              NUMERIC(12, 2);
  v_default_limit      NUMERIC(12, 2);
  v_is_frozen          BOOLEAN;
  v_vibe_enabled       BOOLEAN;
  v_frozen_reason      TEXT;
  v_required           NUMERIC(12, 2);
  v_snapshot           NUMERIC(12, 2);
  v_paid_since_freeze  NUMERIC(12, 2);
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
  ELSE
    v_customer_id := NEW.customer_id;
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT vibe_enabled, vibe_credit_limit_override, is_frozen, frozen_reason,
         required_payment_amount, frozen_debt_snapshot
    INTO v_vibe_enabled, v_limit, v_is_frozen, v_frozen_reason,
         v_required, v_snapshot
    FROM public.customers
   WHERE id = v_customer_id;

  SELECT debt INTO v_debt FROM public.customer_vibe_debt WHERE customer_id = v_customer_id;
  v_debt := COALESCE(v_debt, 0);

  -- Замороженные клиенты с пороговой разморозкой (manual / vibe_revoked_with_debt):
  -- размораживаем когда либо долг = 0, либо погасили достаточно сверх порога.
  IF v_is_frozen IS TRUE
     AND v_frozen_reason IN ('manual', 'vibe_revoked_with_debt')
  THEN
    v_paid_since_freeze := COALESCE(v_snapshot, 0) - v_debt;
    IF v_debt <= 0
       OR (v_required IS NOT NULL AND v_paid_since_freeze >= v_required)
    THEN
      UPDATE public.customers
        SET is_frozen = FALSE,
            frozen_at = NULL,
            required_payment_amount = NULL,
            frozen_reason = NULL,
            frozen_debt_snapshot = NULL
        WHERE id = v_customer_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Если +ВАЙБ выключен и не наш кейс выше — выходим (нечего проверять).
  IF v_vibe_enabled IS NOT TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Дальше — обычная логика автозаморозки по лимиту для активных +ВАЙБ-клиентов.
  SELECT vibe_credit_default_limit INTO v_default_limit
    FROM public.business_settings
    LIMIT 1;

  v_limit := COALESCE(v_limit, v_default_limit, 0);

  IF v_debt > v_limit AND v_is_frozen IS NOT TRUE THEN
    UPDATE public.customers
      SET is_frozen = TRUE,
          frozen_at = NOW(),
          frozen_reason = 'auto_limit_exceeded',
          frozen_debt_snapshot = v_debt,
          required_payment_amount = NULL
      WHERE id = v_customer_id;
  ELSIF v_debt <= v_limit
        AND v_is_frozen IS TRUE
        AND v_frozen_reason = 'auto_limit_exceeded'
  THEN
    UPDATE public.customers
      SET is_frozen = FALSE,
          frozen_at = NULL,
          required_payment_amount = NULL,
          frozen_reason = NULL,
          frozen_debt_snapshot = NULL
      WHERE id = v_customer_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

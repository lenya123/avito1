-- Расширение триггера check_vibe_credit_freeze под решение 2026-05-05:
-- при снятии «+ВАЙБ» при наличии долга клиент замораживается с
-- frozen_reason='vibe_revoked_with_debt'. После погашения долга
-- триггер должен авто-размораживать таких клиентов — но раньше он
-- сразу выходил `IF v_vibe_enabled IS NOT TRUE THEN RETURN`.
--
-- Теперь: для vibe_enabled=false проверяем только специфический случай
-- «vibe_revoked_with_debt» — если долг = 0, размораживаем. Нормальные
-- клиенты без +ВАЙБ (без долга, не замороженные) — не трогаем.

CREATE OR REPLACE FUNCTION public.check_vibe_credit_freeze()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_customer_id UUID;
  v_debt NUMERIC(12, 2);
  v_limit NUMERIC(12, 2);
  v_default_limit NUMERIC(12, 2);
  v_is_frozen BOOLEAN;
  v_vibe_enabled BOOLEAN;
  v_frozen_reason TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
  ELSE
    v_customer_id := NEW.customer_id;
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT vibe_enabled, vibe_credit_limit_override, is_frozen, frozen_reason
    INTO v_vibe_enabled, v_limit, v_is_frozen, v_frozen_reason
    FROM public.customers
    WHERE id = v_customer_id;

  SELECT debt INTO v_debt FROM public.customer_vibe_debt WHERE customer_id = v_customer_id;
  v_debt := COALESCE(v_debt, 0);

  -- Кейс «+ВАЙБ снят, остался долг» — клиент заморожен, ждём оплаты.
  -- При погашении (debt = 0) размораживаем.
  IF v_vibe_enabled IS NOT TRUE THEN
    IF v_is_frozen IS TRUE
       AND v_frozen_reason = 'vibe_revoked_with_debt'
       AND v_debt <= 0
    THEN
      UPDATE public.customers
        SET is_frozen = FALSE,
            frozen_at = NULL,
            required_payment_amount = NULL,
            frozen_reason = NULL
        WHERE id = v_customer_id;
    END IF;
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Дальше — обычная логика для активных +ВАЙБ-клиентов.
  SELECT vibe_credit_default_limit INTO v_default_limit
    FROM public.business_settings
    LIMIT 1;

  v_limit := COALESCE(v_limit, v_default_limit, 0);

  IF v_debt > v_limit AND v_is_frozen IS NOT TRUE THEN
    UPDATE public.customers
      SET is_frozen = TRUE,
          frozen_at = NOW(),
          frozen_reason = 'auto_limit_exceeded'
      WHERE id = v_customer_id;
  ELSIF v_debt <= v_limit AND v_is_frozen IS TRUE THEN
    UPDATE public.customers
      SET is_frozen = FALSE,
          frozen_at = NULL,
          required_payment_amount = NULL,
          frozen_reason = NULL
      WHERE id = v_customer_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

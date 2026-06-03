-- Stage 3.5 — required_payment_amount + frozen_reason + расширенный триггер.
--
-- `required_payment_amount` — сколько нужно заплатить для разморозки
-- (NULL = весь текущий долг). Используется при ручной заморозке владельцем.
-- `frozen_reason` — причина заморозки ('auto_limit_exceeded' | 'owner_manual'
-- | произвольный текст). Обнуляется при разморозке.
--
-- Триггер `check_vibe_credit_freeze` обновлён: при автоматической разморозке
-- (debt <= limit) обнуляем required_payment_amount и frozen_reason;
-- при автозаморозке пишем frozen_reason='auto_limit_exceeded'.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS required_payment_amount NUMERIC(12, 2),
  ADD COLUMN IF NOT EXISTS frozen_reason TEXT;

COMMENT ON COLUMN public.customers.required_payment_amount IS
  'Сколько клиенту нужно заплатить для разморозки (NULL = весь текущий долг). Устанавливается владельцем через ручную заморозку.';
COMMENT ON COLUMN public.customers.frozen_reason IS
  'Причина заморозки: auto_limit_exceeded | owner_manual | произвольный текст. Обнуляется при разморозке.';

-- Обновляем триггер: сбрасываем required/frozen_reason при разморозке,
-- помечаем reason при автозаморозке.
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
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_customer_id := OLD.customer_id;
  ELSE
    v_customer_id := NEW.customer_id;
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT vibe_enabled, vibe_credit_limit_override, is_frozen
    INTO v_vibe_enabled, v_limit, v_is_frozen
    FROM public.customers
    WHERE id = v_customer_id;

  IF v_vibe_enabled IS NOT TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT vibe_credit_default_limit INTO v_default_limit
    FROM public.business_settings
    LIMIT 1;

  v_limit := COALESCE(v_limit, v_default_limit, 0);

  SELECT debt INTO v_debt FROM public.customer_vibe_debt WHERE customer_id = v_customer_id;
  v_debt := COALESCE(v_debt, 0);

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

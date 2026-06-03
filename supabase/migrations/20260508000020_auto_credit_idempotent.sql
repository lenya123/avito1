-- Audit-fix: триггер auto_credit_customer_balance делается идемпотентным.
--
-- Было: триггер пишет +client_price на каждый UPDATE status (если is_paid=true
-- и status переходит в cancelled/return_done/send_by_expired). RPC
-- credit_customer_for_order дополнительно вызывается из card-actions /
-- shipper-actions и проверяет EXISTS (order_id, reason) — это защищает от
-- двойного кредита НО только если RPC выполняется ПОСЛЕ UPDATE статуса.
-- Если порядок поменяется — двойной кредит.
--
-- Стало: тот же EXISTS-check внутри триггера. Любой UPDATE статуса в
-- cancelled/return_done с is_paid=true пишет ровно один кредит на
-- (order_id, reason), независимо от того, вызывает ли TS-код параллельно
-- credit_customer_for_order.
--
-- Бонус: balance_after через RETURNING (вместо отдельного SELECT) —
-- robust к будущим refactor'ам.

CREATE OR REPLACE FUNCTION public.auto_credit_customer_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reason TEXT;
  v_amount NUMERIC(12, 2);
  v_balance_after NUMERIC(12, 2);
  v_already_credited BOOLEAN;
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  IF NEW.is_paid IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.client_price IS NULL OR NEW.client_price <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'return_done' THEN
    v_reason := 'return_done';
  ELSIF NEW.status = 'cancelled' THEN
    IF NEW.cancel_reason = 'send_by_expired' THEN
      v_reason := 'send_by_expired';
    ELSE
      v_reason := 'cancelled_before_ship';
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  -- Идемпотентность: один кредит на (order_id, reason). Защищает от
  -- параллельного вызова credit_customer_for_order из TS-кода и от
  -- любых будущих ретраев.
  SELECT EXISTS (
    SELECT 1 FROM public.customer_balance_history
    WHERE order_id = NEW.id AND reason = v_reason
  ) INTO v_already_credited;

  IF v_already_credited THEN
    RETURN NEW;
  END IF;

  v_amount := NEW.client_price;

  UPDATE public.customers
    SET customer_balance = customer_balance + v_amount
    WHERE id = NEW.customer_id
    RETURNING customer_balance INTO v_balance_after;

  IF v_balance_after IS NULL THEN
    RAISE EXCEPTION 'Customer % not found in auto_credit', NEW.customer_id;
  END IF;

  INSERT INTO public.customer_balance_history (
    customer_id,
    delta,
    balance_after,
    reason,
    order_id
  ) VALUES (
    NEW.customer_id,
    v_amount,
    v_balance_after,
    v_reason,
    NEW.id
  );

  RETURN NEW;
END;
$$;

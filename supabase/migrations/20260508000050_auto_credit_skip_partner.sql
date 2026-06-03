-- Walkthrough: при возврате/отмене партнёрского заказа НЕ пополнять
-- customer_balance автоматически. Партнёр получил деньги от клиента
-- напрямую → партнёр сам возвращает их клиенту вне бота.
--
-- Бот шлёт партнёру DM с просьбой вернуть, клиент получает контакт партнёра
-- и контакт нашей поддержки на случай некорректного поведения партнёра
-- (это в TS-коде, не в триггере).
--
-- Триггер срабатывает на UPDATE status. Skip-условия (в порядке проверки):
--   • status не изменился
--   • is_paid != true (нет денег у клиента — нечего возвращать)
--   • client_price <= 0
--   • customer_id null
--   • partner_id NOT NULL — НОВОЕ: партнёрский заказ, баланс не трогаем
--   • status не cancelled / return_done
--   • уже была запись в history по (order_id, reason) — идемпотентность
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

  -- НОВОЕ: партнёрский заказ — деньги вернёт партнёр сам.
  IF NEW.partner_id IS NOT NULL THEN
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

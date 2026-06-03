-- §6.4/§6.7 fix: брак по вине клиента (кнопка «ненадлежащее качество» на
-- возврате, executeDisputeReturn) → заказ становится return_done +
-- fault_reason='bad_quality'. Деньги клиенту НЕ возвращаются (товар
-- испорчен клиентом, остаётся у владельца — §6.4 «без возврата денег»).
--
-- Баг: auto_credit_customer_balance срабатывает на ЛЮБОЙ return_done по
-- оплаченному своему заказу и метку bad_quality НЕ смотрел → система
-- ВСЁ РАВНО возвращала деньги клиенту (TS-код не звал RPC, но триггер
-- делал это сам). Решение пользователя 2026-05-18: деньги остаются у
-- владельца И идут в выручку (как trash). Здесь — только запрет
-- авто-возврата; учёт в выручке — в isRevenueCounted (TS).
--
-- Тело идентично 20260508000050_auto_credit_skip_partner.sql + один
-- новый skip-гард (bad_quality) после partner-гарда.

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

  -- Партнёрский заказ — деньги вернёт партнёр сам (§10.3).
  IF NEW.partner_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- НОВОЕ (§6.4): брак по вине клиента — авто-возврата НЕТ, деньги
  -- остаются у владельца. Возврат при желании — вручную (§9.7 #3).
  IF NEW.status = 'return_done' AND NEW.fault_reason = 'bad_quality' THEN
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

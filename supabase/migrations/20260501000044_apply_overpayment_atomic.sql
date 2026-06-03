-- Этап 2 walkthrough: при переплате (Vision auto-confirm с переплатой,
-- директор «Сумма не совпала» → X >= ожидалось) лишние деньги:
--   1. сначала гасят +ВАЙБ долг клиента (если есть, частично или полностью).
--   2. остаток падает на customer_balance.
--
-- Возвращает (debt_paid, credit_to_balance) для DM-уведомления клиенту.

CREATE OR REPLACE FUNCTION public.apply_overpayment_atomic(
  p_customer_id UUID,
  p_amount NUMERIC,
  p_order_id UUID DEFAULT NULL
)
RETURNS TABLE (
  debt_paid NUMERIC,
  credit_to_balance NUMERIC,
  new_balance NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_amount NUMERIC := GREATEST(p_amount, 0);
  v_debt NUMERIC;
  v_pay_debt NUMERIC := 0;
  v_credit NUMERIC := 0;
  v_now TIMESTAMPTZ := NOW();
  v_new_balance NUMERIC;
BEGIN
  IF v_amount <= 0 THEN
    SELECT customer_balance INTO v_new_balance FROM public.customers WHERE id = p_customer_id;
    RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, COALESCE(v_new_balance, 0);
    RETURN;
  END IF;

  PERFORM 1 FROM public.customers WHERE id = p_customer_id FOR UPDATE;

  -- Считаем текущий +ВАЙБ-долг через view customer_vibe_debt.
  SELECT COALESCE(debt, 0) INTO v_debt
    FROM public.customer_vibe_debt
   WHERE customer_id = p_customer_id;

  IF v_debt > 0 THEN
    v_pay_debt := LEAST(v_debt, v_amount);
    -- Помечаем самые старые неоплаченные orders is_paid=true пока хватает суммы.
    -- (Простой FIFO — гасим заказы целиком, не делим. Если последний не влезает —
    --  он остаётся в долге, излишек идёт на баланс.)
    DECLARE
      v_remaining NUMERIC := v_pay_debt;
      v_order RECORD;
    BEGIN
      FOR v_order IN
        SELECT id, client_price
          FROM public.orders
         WHERE customer_id = p_customer_id
           AND is_paid = FALSE
           AND status NOT IN ('cancelled', 'trash', 'return_done')
         ORDER BY created_at ASC
      LOOP
        IF v_order.client_price <= v_remaining THEN
          UPDATE public.orders
             SET is_paid = TRUE,
                 paid_at = v_now,
                 payment_method = 'overpayment'
           WHERE id = v_order.id;
          v_remaining := v_remaining - v_order.client_price;
        ELSE
          -- Не хватает на полное погашение — оставляем в долге, выходим.
          EXIT;
        END IF;
        IF v_remaining <= 0 THEN EXIT; END IF;
      END LOOP;
      -- v_remaining > 0 → этот излишек уйдёт в балансовый кредит ниже.
      v_pay_debt := v_pay_debt - v_remaining;
      v_credit := v_amount - v_pay_debt;
    END;
  ELSE
    v_credit := v_amount;
  END IF;

  IF v_credit > 0 THEN
    UPDATE public.customers
       SET customer_balance = customer_balance + v_credit
     WHERE id = p_customer_id
     RETURNING customer_balance INTO v_new_balance;

    INSERT INTO public.customer_balance_history (
      customer_id, delta, balance_after, reason, order_id, created_at
    ) VALUES (
      p_customer_id, v_credit, v_new_balance, 'overpayment_credit', p_order_id, v_now
    );
  ELSE
    SELECT customer_balance INTO v_new_balance FROM public.customers WHERE id = p_customer_id;
  END IF;

  RETURN QUERY SELECT v_pay_debt, v_credit, COALESCE(v_new_balance, 0);
END;
$func$;

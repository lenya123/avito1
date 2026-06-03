-- Phase F.1 — Автопополнение customer_balance при финализации заказа.
--
-- BUSINESS_LOGIC §9.2:
--   Баланс пополняется автоматически только если is_paid=TRUE и клиент
--   физически отдал деньги (чеком). +ВАЙБ-долг с is_paid=FALSE на возврат /
--   отмену уменьшает долг автоматически через customer_vibe_debt view —
--   баланс там не задействован.
--
-- Триггеры:
--   1. return_done с is_paid=TRUE → +client_price (reason='return_done').
--   2. cancelled с is_paid=TRUE до отгрузки → +client_price.
--      reason='send_by_expired' если cancel_reason='send_by_expired',
--      иначе reason='cancelled_before_ship'.
--   3. trash (pickup_by сгорел) → НЕ возвращается автоматически (см. §9.2).
--      Если владелец захочет вернуть — ручная кнопка «Вернуть N₽ клиенту»
--      (Phase F.3 → reason='manual_credit').

CREATE OR REPLACE FUNCTION public.auto_credit_customer_balance()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reason TEXT;
  v_amount NUMERIC(12, 2);
BEGIN
  -- Триггерим только при изменении статуса.
  IF OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  -- Только если заказ был оплачен (чеком, не +ВАЙБ-долгом).
  IF NEW.is_paid IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.client_price IS NULL OR NEW.client_price <= 0 THEN
    RETURN NEW;
  END IF;

  IF NEW.customer_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Определяем причину пополнения.
  IF NEW.status = 'return_done' THEN
    v_reason := 'return_done';
  ELSIF NEW.status = 'cancelled' THEN
    IF NEW.cancel_reason = 'send_by_expired' THEN
      v_reason := 'send_by_expired';
    ELSE
      v_reason := 'cancelled_before_ship';
    END IF;
  ELSE
    -- Прочие переходы (trash и т.д.) — без автопополнения.
    RETURN NEW;
  END IF;

  v_amount := NEW.client_price;

  -- Пополняем баланс + пишем историю атомарно (одной транзакцией).
  UPDATE public.customers
    SET customer_balance = customer_balance + v_amount
    WHERE id = NEW.customer_id;

  INSERT INTO public.customer_balance_history (
    customer_id,
    delta,
    balance_after,
    reason,
    order_id
  )
  SELECT
    NEW.customer_id,
    v_amount,
    customer_balance,
    v_reason,
    NEW.id
  FROM public.customers
  WHERE id = NEW.customer_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_auto_credit_balance ON public.orders;
CREATE TRIGGER trg_orders_auto_credit_balance
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_credit_customer_balance();

COMMENT ON FUNCTION public.auto_credit_customer_balance IS
  'BUSINESS_LOGIC §9.2: автопополнение customer_balance при return_done / cancelled (если is_paid=true). Пишет историю в customer_balance_history. trash — НЕ автопополнение, только ручная кнопка владельца.';

-- Stage 2.3 — +ВАЙБ-кредит: vibe_payments + vibe_payment_orders + view + триггер.
--
-- Модель:
-- - Клиент с vibe_enabled=TRUE может брать заказы в долг (не платить сразу).
-- - Долг считается on-demand через view customer_vibe_debt из orders,
--   денормализации нет.
-- - При превышении лимита (customers.vibe_credit_limit_override или
--   business_settings.vibe_credit_default_limit) триггер AFTER INSERT/UPDATE
--   на orders и vibe_payments проставляет customers.is_frozen=TRUE.
-- - При погашении долга под лимит — is_frozen=FALSE (авторазморозка).
-- - Групповая оплата: один vibe_payments → N vibe_payment_orders (M2M).
-- - Возврат: заказ со статусом return_completed уходит из долга (см. view).
-- - Частичной оплаты нет — только за выбранные заказы целиком (см. план).

-- ===== Платежи =====

CREATE TABLE IF NOT EXISTS public.vibe_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),

  -- Распознавание чека (OpenAI — Stage 3).
  receipt_file_url TEXT,
  receipt_recognized_text TEXT,
  receipt_raw_response JSONB,

  -- FK на payment_methods добавится в Stage 2.4 после создания таблицы.
  payment_method_id UUID,

  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vibe_payments_customer
  ON public.vibe_payments(customer_id, received_at DESC);

-- ===== Связь платёж → заказы (M2M) =====

CREATE TABLE IF NOT EXISTS public.vibe_payment_orders (
  vibe_payment_id UUID NOT NULL REFERENCES public.vibe_payments(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  PRIMARY KEY (vibe_payment_id, order_id)
);

CREATE INDEX IF NOT EXISTS idx_vibe_payment_orders_order ON public.vibe_payment_orders(order_id);

-- ===== View: текущий долг клиента =====

CREATE OR REPLACE VIEW public.customer_vibe_debt AS
SELECT
  c.id AS customer_id,
  COALESCE(SUM(o.client_price), 0)::NUMERIC(12, 2) AS debt
FROM public.customers c
LEFT JOIN public.orders o
  ON o.customer_id = c.id
  AND o.is_paid = FALSE
  AND o.status NOT IN ('cancelled', 'disposed', 'trash', 'return_completed')
GROUP BY c.id;

GRANT SELECT ON public.customer_vibe_debt TO authenticated;

COMMENT ON VIEW public.customer_vibe_debt IS
  'Текущий +ВАЙБ-долг клиента: сумма неоплаченных открытых заказов. Считается on-demand, не денормализован.';

-- ===== Триггер авто-заморозки/разморозки =====

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
  -- Определяем customer_id из NEW или OLD (в зависимости от операции).
  IF TG_OP = 'DELETE' THEN
    IF TG_TABLE_NAME = 'orders' THEN
      v_customer_id := OLD.customer_id;
    ELSE
      v_customer_id := OLD.customer_id;
    END IF;
  ELSE
    IF TG_TABLE_NAME = 'orders' THEN
      v_customer_id := NEW.customer_id;
    ELSE
      v_customer_id := NEW.customer_id;
    END IF;
  END IF;

  IF v_customer_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Читаем настройки клиента.
  SELECT vibe_enabled, vibe_credit_limit_override, is_frozen
    INTO v_vibe_enabled, v_limit, v_is_frozen
    FROM public.customers
    WHERE id = v_customer_id;

  -- Клиент без vibe_enabled — заморозка не применяется.
  IF v_vibe_enabled IS NOT TRUE THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Дефолт лимита.
  SELECT vibe_credit_default_limit INTO v_default_limit
    FROM public.business_settings
    LIMIT 1;

  v_limit := COALESCE(v_limit, v_default_limit, 0);

  -- Текущий долг (из view).
  SELECT debt INTO v_debt FROM public.customer_vibe_debt WHERE customer_id = v_customer_id;
  v_debt := COALESCE(v_debt, 0);

  -- Заморозка / разморозка.
  IF v_debt > v_limit AND v_is_frozen IS NOT TRUE THEN
    UPDATE public.customers
      SET is_frozen = TRUE, frozen_at = NOW()
      WHERE id = v_customer_id;
  ELSIF v_debt <= v_limit AND v_is_frozen IS TRUE THEN
    UPDATE public.customers
      SET is_frozen = FALSE, frozen_at = NULL
      WHERE id = v_customer_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- На orders: AFTER INSERT/UPDATE/DELETE затрагивающий customer_id, is_paid, status, client_price.
DROP TRIGGER IF EXISTS trg_orders_check_vibe_freeze ON public.orders;
CREATE TRIGGER trg_orders_check_vibe_freeze
  AFTER INSERT OR UPDATE OF customer_id, is_paid, status, client_price OR DELETE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vibe_credit_freeze();

-- На vibe_payments: AFTER INSERT/DELETE (апдейт — редкое событие, но покроем тоже).
DROP TRIGGER IF EXISTS trg_vibe_payments_check_freeze ON public.vibe_payments;
CREATE TRIGGER trg_vibe_payments_check_freeze
  AFTER INSERT OR UPDATE OF customer_id, amount OR DELETE ON public.vibe_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.check_vibe_credit_freeze();

-- ===== RLS =====

ALTER TABLE public.vibe_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vibe_payment_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY vibe_payments_owner_all ON public.vibe_payments
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY vibe_payment_orders_owner_all ON public.vibe_payment_orders
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

COMMENT ON TABLE public.vibe_payments IS
  '+ВАЙБ-платежи клиентов. Созд. через customer-bot (Stage 3) под service_role.';
COMMENT ON TABLE public.vibe_payment_orders IS
  'M2M: один vibe_payment может покрывать несколько заказов (групповая оплата чеком).';

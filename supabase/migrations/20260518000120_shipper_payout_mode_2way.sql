-- Модель выплат отправщикам — 2 режима (решение пользователя 2026-05-18).
-- Канон §9.5/9.6. Было: settings.shipper_payment_mode рассинхрон
-- ('dynamic' дефолт в SQL; 'fixed'/'per_order'/'pendulum' в приложении).
-- B2-фикс: единые 2 значения — 'pendulum' | 'fixed'.
--
--  • pendulum — оплата по ELO-рейтингу (shipper_score → ставка
--    rate_min..rate_max). Живая система update_shipper_scores.
--  • fixed    — shipper_fixed_rate ₽ за каждый отгруженный (sent) заказ.
--
-- + helper shipper_current_rate(): ставка отправщика «сейчас» по режиму.
-- Используется триггером снапшота ставки при sent (миграция ..030) для
-- разблокировки §9.4 (прибыль − ставка отправщика).

-- 1. Дефолт → pendulum
ALTER TABLE settings ALTER COLUMN shipper_payment_mode SET DEFAULT 'pendulum';

-- 2. Схлопываем существующее значение в 2 канонических
--    (dynamic / per_order / NULL / любое не-fixed → pendulum).
UPDATE settings
SET shipper_payment_mode = CASE
  WHEN shipper_payment_mode = 'fixed' THEN 'fixed'
  ELSE 'pendulum'
END;

-- 3. CHECK-инвариант: только 2 режима
ALTER TABLE settings DROP CONSTRAINT IF EXISTS shipper_payment_mode_chk;
ALTER TABLE settings
  ADD CONSTRAINT shipper_payment_mode_chk
  CHECK (shipper_payment_mode IN ('pendulum', 'fixed'));

-- 4. Helper: ставка отправщика «сейчас» по текущему режиму.
--    fixed   → shipper_fixed_rate.
--    pendulum→ rate_min + score/100 × (rate_max − rate_min).
--    NULL-отправщик → 0 (owner-manual sent без claimed_by и т.п.).
CREATE OR REPLACE FUNCTION public.shipper_current_rate(p_shipper_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mode  TEXT;
  v_fixed NUMERIC(10,2);
  v_min   NUMERIC(10,2);
  v_max   NUMERIC(10,2);
  v_score NUMERIC(5,2);
BEGIN
  IF p_shipper_id IS NULL THEN
    RETURN 0;
  END IF;

  SELECT
    CASE WHEN COALESCE(shipper_payment_mode, 'pendulum') = 'fixed'
         THEN 'fixed' ELSE 'pendulum' END,
    COALESCE(shipper_fixed_rate, 0),
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250)
  INTO v_mode, v_fixed, v_min, v_max
  FROM settings
  LIMIT 1;

  IF v_mode = 'fixed' THEN
    RETURN ROUND(v_fixed, 2);
  END IF;

  SELECT COALESCE(shipper_score, 50) INTO v_score
  FROM users WHERE id = p_shipper_id;

  IF v_score IS NULL THEN
    v_score := 50;
  END IF;
  v_score := GREATEST(LEAST(v_score, 100), 0);

  RETURN ROUND(v_min + (v_score / 100.0) * (v_max - v_min), 2);
END;
$$;

GRANT EXECUTE ON FUNCTION public.shipper_current_rate(UUID) TO service_role, authenticated;

COMMENT ON FUNCTION public.shipper_current_rate IS
  'Ставка отправщика «сейчас» по текущему режиму выплат (§9.5/9.6): fixed → shipper_fixed_rate; pendulum → rate_min + shipper_score/100 × (rate_max − rate_min). NULL-отправщик → 0. Снапшотится в orders.shipper_rate_snapshot при переходе в sent (§9.4).';

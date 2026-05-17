-- Режим оплаты шиппера: dynamic (тарифная сетка + геймификация) или fixed (одна ставка)

-- ═══════════════════════════════════════════════════════════════════
-- 1. Новые колонки в settings
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE settings ADD COLUMN IF NOT EXISTS shipper_payment_mode TEXT DEFAULT 'dynamic';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS shipper_fixed_rate DECIMAL(10,2) DEFAULT 150;

-- ═══════════════════════════════════════════════════════════════════
-- 2. Обновлённая RPC: учитывает режим оплаты
-- ═══════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION increment_shipper_stat(
  p_shipper_id UUID,
  p_date DATE,
  p_field TEXT,
  p_delta INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orders INT;
  v_rate DECIMAL(10,2);
  v_earnings DECIMAL(10,2);
  v_daily_goal INT;
  v_daily_goal_bonus DECIMAL(10,2);
  v_goal_was_met BOOLEAN;
  v_goal_now_met BOOLEAN;
  v_streak INT := 0;
  v_multiplier DECIMAL(4,2) := 1.0;
  v_streak_mult_3 DECIMAL(4,2);
  v_streak_mult_7 DECIMAL(4,2);
  v_bonus DECIMAL(10,2) := 0;
  v_fallback_rate DECIMAL(10,2);
  v_payment_mode TEXT;
  v_fixed_rate DECIMAL(10,2);
  rec RECORD;
BEGIN
  -- Валидация поля
  IF p_field NOT IN ('orders_shipped', 'returns_collected') THEN
    RAISE EXCEPTION 'Invalid field: %. Allowed: orders_shipped, returns_collected', p_field;
  END IF;

  -- Возвраты — без оплаты (как раньше)
  IF p_field = 'returns_collected' THEN
    INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings)
    VALUES (p_shipper_id, p_date, 0, GREATEST(p_delta, 0), 0)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      returns_collected = GREATEST(shipper_stats.returns_collected + p_delta, 0);
    RETURN;
  END IF;

  -- ─── orders_shipped ───────────────────────────────────────────

  -- 1. Upsert запись
  INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings)
  VALUES (p_shipper_id, p_date, 0, 0, 0)
  ON CONFLICT (shipper_id, date) DO NOTHING;

  -- 2. Обновляем кол-во заказов
  UPDATE shipper_stats
  SET orders_shipped = GREATEST(orders_shipped + p_delta, 0)
  WHERE shipper_id = p_shipper_id AND date = p_date;

  -- 3. Получаем новое кол-во и состояние цели
  SELECT orders_shipped, COALESCE(daily_goal_met, FALSE)
  INTO v_orders, v_goal_was_met
  FROM shipper_stats
  WHERE shipper_id = p_shipper_id AND date = p_date;

  -- 4. Читаем режим оплаты
  SELECT
    COALESCE(shipper_payment_mode, 'dynamic'),
    COALESCE(shipper_fixed_rate, 150),
    COALESCE(shipper_rate, 150),
    COALESCE(daily_goal, 30),
    COALESCE(daily_goal_bonus, 500),
    COALESCE(streak_multiplier_3, 1.5),
    COALESCE(streak_multiplier_7, 2.0)
  INTO v_payment_mode, v_fixed_rate, v_fallback_rate,
       v_daily_goal, v_daily_goal_bonus, v_streak_mult_3, v_streak_mult_7
  FROM settings LIMIT 1;

  -- ═══ FIXED MODE: простая ставка, без геймификации ═══
  IF v_payment_mode = 'fixed' THEN
    v_earnings := v_orders * v_fixed_rate;

    UPDATE shipper_stats SET
      earnings = v_earnings,
      rate_applied = v_fixed_rate,
      daily_goal_met = FALSE,
      daily_bonus = 0
    WHERE shipper_id = p_shipper_id AND date = p_date;

    RETURN;
  END IF;

  -- ═══ DYNAMIC MODE: тарифная сетка + цели + streak ═══

  -- 5. Определяем ставку из тарифной сетки
  SELECT COALESCE(
    (SELECT rate FROM shipper_rate_tiers
     WHERE min_orders <= v_orders
     ORDER BY min_orders DESC LIMIT 1),
    v_fallback_rate
  ) INTO v_rate;

  -- 6. Пересчитываем earnings
  v_earnings := v_orders * v_rate;

  -- 7. Проверяем дневную цель
  v_goal_now_met := v_orders >= v_daily_goal;

  -- 8. Считаем бонус если цель выполнена
  IF v_goal_now_met THEN
    v_streak := 0;
    FOR rec IN
      SELECT daily_goal_met, orders_shipped
      FROM shipper_stats
      WHERE shipper_id = p_shipper_id AND date < p_date
      ORDER BY date DESC
      LIMIT 60
    LOOP
      IF rec.orders_shipped = 0 OR rec.orders_shipped IS NULL THEN
        CONTINUE;
      END IF;
      IF rec.daily_goal_met THEN
        v_streak := v_streak + 1;
      ELSE
        EXIT;
      END IF;
    END LOOP;

    IF v_streak >= 7 THEN
      v_multiplier := v_streak_mult_7;
    ELSIF v_streak >= 3 THEN
      v_multiplier := v_streak_mult_3;
    ELSE
      v_multiplier := 1.0;
    END IF;

    v_bonus := v_daily_goal_bonus * v_multiplier;
  ELSE
    v_bonus := 0;
  END IF;

  -- 9. Обновляем запись
  UPDATE shipper_stats SET
    earnings = v_earnings,
    rate_applied = v_rate,
    daily_goal_met = v_goal_now_met,
    daily_bonus = v_bonus
  WHERE shipper_id = p_shipper_id AND date = p_date;
END;
$$;

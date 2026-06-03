-- Переход на модель эффективности:
-- efficiency = days_active / work_days_passed (за текущий месяц)
-- rate = rate_min + efficiency * (rate_max - rate_min)
-- Убраны: тарифные пороги (shipper_rate_tiers), стрики, daily_goal бонусы

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
  v_payment_mode TEXT;
  v_fixed_rate DECIMAL(10,2);
  v_rate_min DECIMAL(10,2);
  v_rate_max DECIMAL(10,2);
  v_work_days INT[];
  v_month_start DATE;
  v_work_days_passed INT := 0;
  v_days_active INT := 0;
  v_efficiency DECIMAL(5,4) := 0.5;
  v_check_date DATE;
  v_dow INT;
BEGIN
  -- Валидация поля
  IF p_field NOT IN ('orders_shipped', 'returns_collected') THEN
    RAISE EXCEPTION 'Invalid field: %. Allowed: orders_shipped, returns_collected', p_field;
  END IF;

  -- Возвраты — без оплаты
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

  -- 3. Получаем новое кол-во
  SELECT orders_shipped INTO v_orders
  FROM shipper_stats
  WHERE shipper_id = p_shipper_id AND date = p_date;

  -- 4. Читаем настройки
  SELECT
    COALESCE(shipper_payment_mode, 'dynamic'),
    COALESCE(shipper_fixed_rate, 150),
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250)
  INTO v_payment_mode, v_fixed_rate, v_rate_min, v_rate_max
  FROM settings LIMIT 1;

  -- ═══ FIXED MODE ═══
  IF v_payment_mode = 'fixed' THEN
    UPDATE shipper_stats SET
      earnings = v_orders * v_fixed_rate,
      rate_applied = v_fixed_rate
    WHERE shipper_id = p_shipper_id AND date = p_date;
    RETURN;
  END IF;

  -- ═══ DYNAMIC MODE: ставка по эффективности ═══

  -- 5. Получаем рабочие дни отправщика
  SELECT work_days INTO v_work_days FROM users WHERE id = p_shipper_id;

  -- 6. Начало месяца
  v_month_start := DATE_TRUNC('month', p_date)::DATE;

  -- 7. Считаем сколько рабочих дней прошло в этом месяце (включая сегодня)
  v_check_date := v_month_start;
  WHILE v_check_date <= p_date LOOP
    v_dow := EXTRACT(DOW FROM v_check_date)::INT; -- 0=Вс, 1=Пн...6=Сб
    IF v_work_days IS NULL OR array_length(v_work_days, 1) IS NULL OR v_dow = ANY(v_work_days) THEN
      v_work_days_passed := v_work_days_passed + 1;
    END IF;
    v_check_date := v_check_date + 1;
  END LOOP;

  -- 8. Считаем сколько дней в этом месяце отправщик реально работал (shipped > 0)
  SELECT COUNT(*) INTO v_days_active
  FROM shipper_stats
  WHERE shipper_id = p_shipper_id
    AND date >= v_month_start
    AND date <= p_date
    AND orders_shipped > 0;

  -- 9. Эффективность (0.0 — 1.0)
  IF v_work_days_passed > 0 THEN
    v_efficiency := v_days_active::DECIMAL / v_work_days_passed;
  ELSE
    v_efficiency := 0.5; -- начало месяца, нет данных — базовая ставка
  END IF;
  v_efficiency := GREATEST(LEAST(v_efficiency, 1.0), 0.0);

  -- 10. Ставка = мин + эффективность × (макс - мин)
  v_rate := v_rate_min + v_efficiency * (v_rate_max - v_rate_min);
  v_rate := ROUND(v_rate, 2);

  -- 11. Заработок за день
  v_earnings := v_orders * v_rate;

  UPDATE shipper_stats SET
    earnings = v_earnings,
    rate_applied = v_rate
  WHERE shipper_id = p_shipper_id AND date = p_date;
END;
$$;

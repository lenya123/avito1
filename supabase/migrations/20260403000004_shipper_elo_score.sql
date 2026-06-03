-- ELO-система эффективности отправщиков
-- score 0-100: определяет ставку от rateMin до rateMax
-- Обновляется ежедневно: shipped/available → ELO delta с асимметрией (падать легче)

-- 1. Score у отправщика (постоянный, не сбрасывается)
ALTER TABLE users ADD COLUMN IF NOT EXISTS shipper_score DECIMAL(5,2) DEFAULT 50;

-- 2. Доступные заказы за день (заполняется daily job)
ALTER TABLE shipper_stats ADD COLUMN IF NOT EXISTS orders_available INT DEFAULT 0;

-- 3. Обновлённая RPC: использует score из users для расчёта ставки
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
  v_score DECIMAL(5,2);
BEGIN
  IF p_field NOT IN ('orders_shipped', 'returns_collected') THEN
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;

  -- Возвраты — без оплаты
  IF p_field = 'returns_collected' THEN
    INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings)
    VALUES (p_shipper_id, p_date, 0, GREATEST(p_delta, 0), 0)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      returns_collected = GREATEST(shipper_stats.returns_collected + p_delta, 0);
    RETURN;
  END IF;

  -- Upsert
  INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings)
  VALUES (p_shipper_id, p_date, 0, 0, 0)
  ON CONFLICT (shipper_id, date) DO NOTHING;

  -- Обновляем кол-во
  UPDATE shipper_stats
  SET orders_shipped = GREATEST(orders_shipped + p_delta, 0)
  WHERE shipper_id = p_shipper_id AND date = p_date;

  SELECT orders_shipped INTO v_orders
  FROM shipper_stats WHERE shipper_id = p_shipper_id AND date = p_date;

  -- Настройки
  SELECT
    COALESCE(shipper_payment_mode, 'dynamic'),
    COALESCE(shipper_fixed_rate, 150),
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250)
  INTO v_payment_mode, v_fixed_rate, v_rate_min, v_rate_max
  FROM settings LIMIT 1;

  -- FIXED
  IF v_payment_mode = 'fixed' THEN
    UPDATE shipper_stats SET
      earnings = v_orders * v_fixed_rate,
      rate_applied = v_fixed_rate
    WHERE shipper_id = p_shipper_id AND date = p_date;
    RETURN;
  END IF;

  -- DYNAMIC: ставка по score
  SELECT COALESCE(shipper_score, 50) INTO v_score FROM users WHERE id = p_shipper_id;
  v_score := GREATEST(LEAST(v_score, 100), 0);

  v_rate := ROUND(v_rate_min + (v_score / 100.0) * (v_rate_max - v_rate_min), 2);
  v_earnings := v_orders * v_rate;

  UPDATE shipper_stats SET
    earnings = v_earnings,
    rate_applied = v_rate
  WHERE shipper_id = p_shipper_id AND date = p_date;
END;
$$;

-- 4. Daily job function: пересчитывает score для всех отправщиков за вчерашний день
CREATE OR REPLACE FUNCTION update_shipper_scores(p_date DATE)
RETURNS TABLE(shipper_id UUID, old_score DECIMAL, new_score DECIMAL, result DECIMAL, delta DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_rate_min DECIMAL(10,2);
  v_rate_max DECIMAL(10,2);
  v_penalty_rate DECIMAL(10,2);
  v_payment_mode TEXT;
  v_total_available INT;
  v_active_shippers INT;
  v_available_per_shipper INT;
  rec RECORD;
  v_score DECIMAL(5,2);
  v_shipped INT;
  v_completion DECIMAL(5,4);
  v_expected DECIMAL(5,4);
  v_k DECIMAL(5,2);
  v_raw_delta DECIMAL(10,4);
  v_new_score DECIMAL(5,2);
  v_days_worked INT;
  v_dow INT;
  v_work_days INT[];
  v_is_work_day BOOLEAN;
BEGIN
  -- Читаем настройки
  SELECT
    COALESCE(shipper_payment_mode, 'dynamic'),
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250),
    COALESCE(shipper_penalty_rate, 0)
  INTO v_payment_mode, v_rate_min, v_rate_max, v_penalty_rate
  FROM settings LIMIT 1;

  -- Только для dynamic
  IF v_payment_mode = 'fixed' THEN
    RETURN;
  END IF;

  -- Считаем доступные заказы за этот день:
  -- заказы со статусом awaiting_shipment/collecting на эту дату
  -- + заказы отправленные в этот день (они были доступны)
  SELECT COUNT(*) INTO v_total_available
  FROM orders
  WHERE (
    -- Заказы отправленные в этот день
    (shipped_at >= p_date::TIMESTAMP AND shipped_at < (p_date + 1)::TIMESTAMP)
    OR
    -- Заказы которые были доступны но не отправлены
    (status IN ('awaiting_shipment', 'collecting', 'problem')
     AND created_at < (p_date + 1)::TIMESTAMP)
  );

  -- Кол-во активных отправщиков (с work_days включающими этот день ИЛИ без ограничений)
  v_dow := EXTRACT(DOW FROM p_date)::INT;

  SELECT COUNT(*) INTO v_active_shippers
  FROM users
  WHERE role = 'shipper'
    AND (work_days IS NULL OR array_length(work_days, 1) IS NULL OR v_dow = ANY(work_days));

  v_active_shippers := GREATEST(v_active_shippers, 1);
  v_available_per_shipper := GREATEST(CEIL(v_total_available::DECIMAL / v_active_shippers), 1);

  -- Обрабатываем каждого отправщика
  FOR rec IN
    SELECT u.id, u.shipper_score, u.work_days AS u_work_days, u.created_at AS u_created_at
    FROM users u
    WHERE u.role = 'shipper'
  LOOP
    -- Проверяем рабочий день
    v_work_days := rec.u_work_days;
    v_is_work_day := (v_work_days IS NULL OR array_length(v_work_days, 1) IS NULL OR v_dow = ANY(v_work_days));

    IF NOT v_is_work_day THEN
      CONTINUE; -- выходной — score не меняется
    END IF;

    v_score := COALESCE(rec.shipper_score, 50);

    -- Сколько отправил за этот день
    SELECT COALESCE(ss.orders_shipped, 0) INTO v_shipped
    FROM shipper_stats ss
    WHERE ss.shipper_id = rec.id AND ss.date = p_date;

    IF v_shipped IS NULL THEN v_shipped := 0; END IF;

    -- Записываем orders_available
    INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings, orders_available)
    VALUES (rec.id, p_date, 0, 0, 0, v_available_per_shipper)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      orders_available = v_available_per_shipper;

    -- Completion rate (0.0 — 1.0)
    IF v_total_available = 0 THEN
      -- Нет заказов в системе — не наказываем
      CONTINUE;
    END IF;

    v_completion := LEAST(v_shipped::DECIMAL / v_available_per_shipper, 1.0);

    -- ELO: K-фактор (32 для новичков < 30 дней, 16 потом)
    SELECT COUNT(*) INTO v_days_worked
    FROM shipper_stats
    WHERE shipper_stats.shipper_id = rec.id AND orders_shipped > 0;

    v_k := CASE WHEN v_days_worked < 30 THEN 32 ELSE 16 END;

    -- expected = текущий уровень (score / 100)
    v_expected := v_score / 100.0;

    -- raw delta = K × (result - expected)
    v_raw_delta := v_k * (v_completion - v_expected);

    -- Асимметрия: отрицательный delta × 2.5
    IF v_raw_delta < 0 THEN
      v_raw_delta := v_raw_delta * 2.5;
    END IF;

    -- Новый score
    v_new_score := GREATEST(LEAST(v_score + v_raw_delta, 100), 0);
    v_new_score := ROUND(v_new_score, 2);

    -- Обновляем score
    UPDATE users SET shipper_score = v_new_score WHERE id = rec.id;

    -- Пересчитываем earnings за этот день с новой ставкой
    DECLARE
      v_new_rate DECIMAL(10,2);
      v_day_orders INT;
    BEGIN
      v_new_rate := ROUND(v_rate_min + (v_new_score / 100.0) * (v_rate_max - v_rate_min), 2);

      SELECT orders_shipped INTO v_day_orders
      FROM shipper_stats WHERE shipper_stats.shipper_id = rec.id AND date = p_date;

      IF v_day_orders > 0 THEN
        UPDATE shipper_stats SET
          earnings = v_day_orders * v_new_rate,
          rate_applied = v_new_rate
        WHERE shipper_stats.shipper_id = rec.id AND date = p_date;
      END IF;
    END;

    -- Return row
    shipper_id := rec.id;
    old_score := v_score;
    new_score := v_new_score;
    result := v_completion;
    delta := v_new_score - v_score;
    RETURN NEXT;
  END LOOP;
END;
$$;

-- Расписание работы отправщиков: начало и конец рабочего дня (часы, 0-23).
-- Буфер 1 час: заказы, поступившие за час до конца смены, не учитываются в orders_available.

ALTER TABLE users ADD COLUMN IF NOT EXISTS work_hour_start INT DEFAULT 9;
ALTER TABLE users ADD COLUMN IF NOT EXISTS work_hour_end INT DEFAULT 18;

ALTER TABLE users ADD CONSTRAINT work_hour_start_range CHECK (work_hour_start >= 0 AND work_hour_start <= 23);
ALTER TABLE users ADD CONSTRAINT work_hour_end_range CHECK (work_hour_end >= 0 AND work_hour_end <= 23);
ALTER TABLE users ADD CONSTRAINT work_hours_order CHECK (work_hour_end > work_hour_start);

-- Обновлённая функция подсчёта ELO с учётом расписания
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
  v_active_shippers INT;
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
  v_cutoff TIMESTAMP;
  v_personal_available INT;
BEGIN
  SELECT
    COALESCE(shipper_payment_mode, 'dynamic'),
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250),
    COALESCE(shipper_penalty_rate, 0)
  INTO v_payment_mode, v_rate_min, v_rate_max, v_penalty_rate
  FROM settings LIMIT 1;

  IF v_payment_mode = 'fixed' THEN
    RETURN;
  END IF;

  v_dow := EXTRACT(DOW FROM p_date)::INT;

  -- Считаем активных отправщиков за этот день (для деления)
  SELECT COUNT(*) INTO v_active_shippers
  FROM users
  WHERE role = 'shipper'
    AND (work_days IS NULL OR array_length(work_days, 1) IS NULL OR v_dow = ANY(work_days));

  v_active_shippers := GREATEST(v_active_shippers, 1);

  FOR rec IN
    SELECT u.id, u.shipper_score, u.work_days AS u_work_days,
           COALESCE(u.work_hour_start, 9) AS u_hour_start,
           COALESCE(u.work_hour_end, 18) AS u_hour_end
    FROM users u
    WHERE u.role = 'shipper'
  LOOP
    v_work_days := rec.u_work_days;
    v_is_work_day := (v_work_days IS NULL OR array_length(v_work_days, 1) IS NULL OR v_dow = ANY(v_work_days));

    IF NOT v_is_work_day THEN
      CONTINUE;
    END IF;

    v_score := COALESCE(rec.shipper_score, 65);

    -- Cutoff = конец смены минус 1 час (буфер на упаковку)
    v_cutoff := p_date::TIMESTAMP + ((rec.u_hour_end - 1) || ' hours')::INTERVAL;

    -- Считаем заказы, доступные ЭТОМУ отправщику до его cutoff
    -- Включает: отправленные до cutoff + неотправленные, созданные до cutoff
    SELECT COUNT(*) INTO v_personal_available
    FROM orders
    WHERE (
      (shipped_at >= p_date::TIMESTAMP AND shipped_at < v_cutoff)
      OR
      (status IN ('awaiting_shipment', 'collecting', 'problem')
       AND created_at < v_cutoff)
    );

    -- Делим на активных отправщиков
    v_personal_available := GREATEST(CEIL(v_personal_available::DECIMAL / v_active_shippers), 1);

    SELECT COALESCE(ss.orders_shipped, 0) INTO v_shipped
    FROM shipper_stats ss
    WHERE ss.shipper_id = rec.id AND ss.date = p_date;

    IF v_shipped IS NULL THEN v_shipped := 0; END IF;

    -- Записываем orders_available
    INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings, orders_available)
    VALUES (rec.id, p_date, 0, 0, 0, v_personal_available)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      orders_available = v_personal_available;

    IF v_personal_available = 0 THEN
      CONTINUE; -- нет заказов — score не меняется
    END IF;

    v_completion := LEAST(v_shipped::DECIMAL / v_personal_available, 1.0);

    -- K-фактор: 32 первые 30 рабочих дней, 10 после
    SELECT COUNT(*) INTO v_days_worked
    FROM shipper_stats
    WHERE shipper_stats.shipper_id = rec.id AND orders_shipped > 0;

    v_k := CASE WHEN v_days_worked < 30 THEN 32 ELSE 10 END;

    v_expected := v_score / 100.0;
    v_raw_delta := v_k * (v_completion - v_expected);

    -- Асимметрия x2.0
    IF v_raw_delta < 0 THEN
      v_raw_delta := v_raw_delta * 2.0;
    END IF;

    -- Лимит падения: max -8 за день
    IF v_raw_delta < -8 THEN
      v_raw_delta := -8;
    END IF;

    v_new_score := GREATEST(LEAST(v_score + v_raw_delta, 100), 0);
    v_new_score := ROUND(v_new_score, 2);

    UPDATE users SET shipper_score = v_new_score WHERE id = rec.id;

    -- Пересчитываем earnings с новой ставкой
    DECLARE
      v_new_rate DECIMAL(10,2);
      v_day_orders INT;
    BEGIN
      -- S-кривая: декселератор (0-50) → стандарт (50-80) → акселератор (80-100)
      DECLARE
        v_t DECIMAL(5,4);
        v_factor DECIMAL(5,4);
      BEGIN
        v_t := v_new_score;
        IF v_t <= 50 THEN
          v_factor := (v_t / 50.0) * 0.15;
        ELSIF v_t <= 80 THEN
          v_factor := 0.15 + ((v_t - 50) / 30.0) * 0.35;
        ELSE
          v_factor := 0.50 + ((v_t - 80) / 20.0) * 0.50;
        END IF;
        v_new_rate := ROUND(v_rate_min + v_factor * (v_rate_max - v_rate_min), 0);
      END;

      SELECT orders_shipped INTO v_day_orders
      FROM shipper_stats WHERE shipper_stats.shipper_id = rec.id AND date = p_date;

      IF v_day_orders > 0 THEN
        UPDATE shipper_stats SET
          earnings = v_day_orders * v_new_rate,
          rate_applied = v_new_rate
        WHERE shipper_stats.shipper_id = rec.id AND date = p_date;
      END IF;
    END;

    shipper_id := rec.id;
    old_score := v_score;
    new_score := v_new_score;
    result := v_completion;
    delta := v_new_score - v_score;
    RETURN NEXT;
  END LOOP;
END;
$$;

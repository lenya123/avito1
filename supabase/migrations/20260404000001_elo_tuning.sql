-- Тюнинг ELO-параметров по исследованию лучших практик:
-- 1. Старт 65 вместо 50 (Amazon/DoorDash стартуют высоко)
-- 2. K=10 после калибровки вместо 16 (меньше скачков для ветеранов)
-- 3. Асимметрия ×2.0 вместо ×2.5 (менее агрессивно)
-- 4. Grace period: первые 10 рабочих дней — score не двигается
-- 5. Лимит падения: max −8 за один день

-- Обновляем дефолтный score для новых отправщиков
ALTER TABLE users ALTER COLUMN shipper_score SET DEFAULT 65;

-- Обновляем существующих отправщиков со score=50 (ещё не работали) на 65
UPDATE users SET shipper_score = 65 WHERE role = 'shipper' AND shipper_score = 50;

-- Обновлённая функция с тюнингом
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

  IF v_payment_mode = 'fixed' THEN
    RETURN;
  END IF;

  -- Доступные заказы за этот день
  SELECT COUNT(*) INTO v_total_available
  FROM orders
  WHERE (
    (shipped_at >= p_date::TIMESTAMP AND shipped_at < (p_date + 1)::TIMESTAMP)
    OR
    (status IN ('awaiting_shipment', 'collecting', 'problem')
     AND created_at < (p_date + 1)::TIMESTAMP)
  );

  -- Активные отправщики на этот день недели
  v_dow := EXTRACT(DOW FROM p_date)::INT;

  SELECT COUNT(*) INTO v_active_shippers
  FROM users
  WHERE role = 'shipper'
    AND (work_days IS NULL OR array_length(work_days, 1) IS NULL OR v_dow = ANY(work_days));

  v_active_shippers := GREATEST(v_active_shippers, 1);
  v_available_per_shipper := GREATEST(CEIL(v_total_available::DECIMAL / v_active_shippers), 1);

  FOR rec IN
    SELECT u.id, u.shipper_score, u.work_days AS u_work_days
    FROM users u
    WHERE u.role = 'shipper'
  LOOP
    v_work_days := rec.u_work_days;
    v_is_work_day := (v_work_days IS NULL OR array_length(v_work_days, 1) IS NULL OR v_dow = ANY(v_work_days));

    IF NOT v_is_work_day THEN
      CONTINUE;
    END IF;

    v_score := COALESCE(rec.shipper_score, 65);

    SELECT COALESCE(ss.orders_shipped, 0) INTO v_shipped
    FROM shipper_stats ss
    WHERE ss.shipper_id = rec.id AND ss.date = p_date;

    IF v_shipped IS NULL THEN v_shipped := 0; END IF;

    -- Записываем orders_available
    INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings, orders_available)
    VALUES (rec.id, p_date, 0, 0, 0, v_available_per_shipper)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      orders_available = v_available_per_shipper;

    IF v_total_available = 0 THEN
      CONTINUE; -- нет заказов — score не меняется
    END IF;

    -- Grace period: первые 10 рабочих дней — score не двигается
    SELECT COUNT(*) INTO v_days_worked
    FROM shipper_stats
    WHERE shipper_stats.shipper_id = rec.id AND orders_shipped > 0;

    IF v_days_worked < 10 THEN
      CONTINUE; -- калибровочный период — фиксированная базовая ставка
    END IF;

    v_completion := LEAST(v_shipped::DECIMAL / v_available_per_shipper, 1.0);

    -- K-фактор: 32 для калибровки (10-30 дней), 10 после
    v_k := CASE WHEN v_days_worked < 30 THEN 32 ELSE 10 END;

    -- expected = текущий уровень
    v_expected := v_score / 100.0;

    -- raw delta
    v_raw_delta := v_k * (v_completion - v_expected);

    -- Асимметрия: отрицательный delta × 2.0
    IF v_raw_delta < 0 THEN
      v_raw_delta := v_raw_delta * 2.0;
    END IF;

    -- Лимит падения: max −8 за день
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

    shipper_id := rec.id;
    old_score := v_score;
    new_score := v_new_score;
    result := v_completion;
    delta := v_new_score - v_score;
    RETURN NEXT;
  END LOOP;
END;
$$;

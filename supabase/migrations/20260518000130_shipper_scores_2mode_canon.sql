-- Канон §9.5/9.6 — 2-режимная модель выплат. Переписаны обе функции
-- начисления (решение пользователя 2026-05-18). Чинятся 3 бага «маятника»:
--
--  B1. update_shipper_scores считал «доступные заказы» по МЁРТВОМУ
--      статусу awaiting_shipment (выпилен 2026-05-07). База рейтинга/
--      ставки была кривая. Канон §4.2: «доступно за день» = заказы,
--      бывшие готовыми к отгрузке в этот день = sent в этот день ИЛИ
--      открытые paid/collecting/problem на конец дня.
--  B2. Режим: единые значения 'pendulum' | 'fixed' (нормализуем не-fixed
--      → pendulum). Раньше SQL ждал 'dynamic', приложение слало другое.
--  B3. fixed-режим: earnings начисляются ЯВНО в increment_shipper_stat
--      (orders_shipped × shipper_fixed_rate). update_shipper_scores в
--      fixed-режиме рейтинг не трогает (score заморожен как KPI).
--
-- Сигнатуры функций не меняются → CREATE OR REPLACE безопасен.

-- ─────────────────────────────────────────────────────────────────────
-- 1. increment_shipper_stat — начисление при каждом sent / return_done.
--    fixed   → earnings = orders_shipped × shipper_fixed_rate.
--    pendulum→ earnings = orders_shipped × rate(score) [уточняется в
--              update_shipper_scores в 00:10 с новым score за день].
--    returns_collected — без оплаты (как и было).
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.increment_shipper_stat(
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
  v_orders     INT;
  v_rate       DECIMAL(10,2);
  v_payment_mode TEXT;
  v_fixed_rate DECIMAL(10,2);
  v_rate_min   DECIMAL(10,2);
  v_rate_max   DECIMAL(10,2);
  v_score      DECIMAL(5,2);
BEGIN
  IF p_field NOT IN ('orders_shipped', 'returns_collected') THEN
    RAISE EXCEPTION 'Invalid field: %', p_field;
  END IF;

  -- Возвраты — без оплаты (отдельная KPI-метрика, не заработок).
  IF p_field = 'returns_collected' THEN
    INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings)
    VALUES (p_shipper_id, p_date, 0, GREATEST(p_delta, 0), 0)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      returns_collected = GREATEST(shipper_stats.returns_collected + p_delta, 0);
    RETURN;
  END IF;

  -- ─── orders_shipped ───
  INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings)
  VALUES (p_shipper_id, p_date, 0, 0, 0)
  ON CONFLICT (shipper_id, date) DO NOTHING;

  UPDATE shipper_stats
  SET orders_shipped = GREATEST(orders_shipped + p_delta, 0)
  WHERE shipper_id = p_shipper_id AND date = p_date;

  SELECT orders_shipped INTO v_orders
  FROM shipper_stats WHERE shipper_id = p_shipper_id AND date = p_date;

  SELECT
    CASE WHEN COALESCE(shipper_payment_mode, 'pendulum') = 'fixed'
         THEN 'fixed' ELSE 'pendulum' END,
    COALESCE(shipper_fixed_rate, 0),
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250)
  INTO v_payment_mode, v_fixed_rate, v_rate_min, v_rate_max
  FROM settings LIMIT 1;

  -- FIXED: фиксированная ставка за каждый sent (B3 — начисляем явно).
  IF v_payment_mode = 'fixed' THEN
    UPDATE shipper_stats SET
      earnings = v_orders * v_fixed_rate,
      rate_applied = v_fixed_rate
    WHERE shipper_id = p_shipper_id AND date = p_date;
    RETURN;
  END IF;

  -- PENDULUM: ставка от текущего ELO-score (точный пересчёт за день —
  -- в update_shipper_scores 00:10 МСК с новым score).
  SELECT COALESCE(shipper_score, 50) INTO v_score FROM users WHERE id = p_shipper_id;
  v_score := GREATEST(LEAST(COALESCE(v_score, 50), 100), 0);

  v_rate := ROUND(v_rate_min + (v_score / 100.0) * (v_rate_max - v_rate_min), 2);

  UPDATE shipper_stats SET
    earnings = v_orders * v_rate,
    rate_applied = v_rate
  WHERE shipper_id = p_shipper_id AND date = p_date;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- 2. update_shipper_scores — ежедневный ELO-пересчёт (00:10 МСК).
--    fixed   → ничего не пересчитываем (score заморожен; earnings уже
--              начислены increment_shipper_stat).
--    pendulum→ score 0..100 двигается от доли отгруженных доступных;
--              earnings за день пересчитываются с новым score.
--    B1: «доступно за день» по канон-статусам §4.2.
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_shipper_scores(p_date DATE)
RETURNS TABLE(shipper_id UUID, old_score DECIMAL, new_score DECIMAL, result DECIMAL, delta DECIMAL)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
#variable_conflict use_column
DECLARE
  v_rate_min DECIMAL(10,2);
  v_rate_max DECIMAL(10,2);
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
  SELECT
    CASE WHEN COALESCE(shipper_payment_mode, 'pendulum') = 'fixed'
         THEN 'fixed' ELSE 'pendulum' END,
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250)
  INTO v_payment_mode, v_rate_min, v_rate_max
  FROM settings LIMIT 1;

  -- В fixed-режиме рейтинг не управляет оплатой — заморожен.
  IF v_payment_mode = 'fixed' THEN
    RETURN;
  END IF;

  -- B1: «доступно за день» по канон-статусам §4.2.
  -- Заказ был «доступен к отгрузке» в этот день, если он:
  --   • был отгружен (sent) в этот день, ИЛИ
  --   • открыт и ждёт отгрузки (paid/collecting/problem) и создан
  --     не позже конца этого дня.
  SELECT COUNT(*) INTO v_total_available
  FROM orders
  WHERE (
    (shipped_at >= p_date::TIMESTAMP AND shipped_at < (p_date + 1)::TIMESTAMP)
    OR
    (status IN ('paid', 'collecting', 'problem')
     AND created_at < (p_date + 1)::TIMESTAMP)
  );

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

    v_score := COALESCE(rec.shipper_score, 50);

    SELECT COALESCE(ss.orders_shipped, 0) INTO v_shipped
    FROM shipper_stats ss
    WHERE ss.shipper_id = rec.id AND ss.date = p_date;

    IF v_shipped IS NULL THEN v_shipped := 0; END IF;

    INSERT INTO shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings, orders_available)
    VALUES (rec.id, p_date, 0, 0, 0, v_available_per_shipper)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      orders_available = v_available_per_shipper;

    IF v_total_available = 0 THEN
      CONTINUE;
    END IF;

    v_completion := LEAST(v_shipped::DECIMAL / v_available_per_shipper, 1.0);

    SELECT COUNT(*) INTO v_days_worked
    FROM shipper_stats
    WHERE shipper_stats.shipper_id = rec.id AND orders_shipped > 0;

    v_k := CASE WHEN v_days_worked < 30 THEN 32 ELSE 16 END;

    v_expected := v_score / 100.0;
    v_raw_delta := v_k * (v_completion - v_expected);

    -- Асимметрия: падать легче, чем расти.
    IF v_raw_delta < 0 THEN
      v_raw_delta := v_raw_delta * 2.5;
    END IF;

    v_new_score := GREATEST(LEAST(v_score + v_raw_delta, 100), 0);
    v_new_score := ROUND(v_new_score, 2);

    UPDATE users SET shipper_score = v_new_score WHERE id = rec.id;

    -- Пересчитываем earnings за день с новой ставкой (точное значение).
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

-- Phase A.1 — Merge order status enum to new 9-status set (BUSINESS_LOGIC.md §4.2).
--
-- Старые статусы (12) → новые (9):
--   pending_payment   → cancelled  (легаси-сессии без оплаты, бросаем — в новой модели заказ
--                                   рождается только после Vision auto-confirm или +ВАЙБ-долга)
--   awaiting_shipment → paid       (оплачен и ждёт сборки = «общий пул»)
--   in_transit        → sent       («отправлен» — финальный успешный, без опроса трека)
--   completed         → sent       (то же самое)
--   return_in_transit → return     (клиент оформил возврат)
--   return_arrived    → return     (то же самое — нет промежуточного «доехал»)
--   return_completed  → return_done(возврат принят)
--   disposed          → trash      (старый «утиль» = новый «trash»)
--
-- Стабильные имена (без изменений): collecting, printed, sent, return, return_done,
--                                   trash, cancelled, problem, paid (новое — было неявное).
--
-- Также:
--   - DROP idx_orders_deadline (зависит от 'awaiting_shipment')
--   - CREATE OR REPLACE update_product_quantity_on_order на новые имена
--   - DROP сломанного triggers/functions из seller-эпохи (shipper_ledger_on_order_completed
--     ссылается на orders.seller_id, который удалён в Stage 1)
--   - DROP+CREATE RLS-политик на orders / order_messages / orders_realtime_anon
--   - CREATE OR REPLACE customer_vibe_debt VIEW
--   - CREATE OR REPLACE update_shipper_scores function (legacy ELO будет заменён в Phase E,
--     пока приводим к новым именам чтобы не падал на UPDATE)

-- =====================================================================
-- 1. Удаляем индексы и политики, чьё условие ссылается на старые статусы
-- =====================================================================

DROP INDEX IF EXISTS public.idx_orders_deadline;

DROP POLICY IF EXISTS orders_select ON public.orders;
DROP POLICY IF EXISTS orders_realtime_anon ON public.orders;
DROP POLICY IF EXISTS order_messages_shipper_select ON public.order_messages;

-- =====================================================================
-- 2. Удаляем сломанный shipper_ledger trigger из seller-эпохи
--    (ссылается на orders.seller_id который удалён в Stage 1).
--    Phase F переопределит ledger-логику под новую модель.
-- =====================================================================

DROP TRIGGER IF EXISTS shipper_ledger_on_order_status_change ON public.orders;
DROP FUNCTION IF EXISTS public.shipper_ledger_on_order_completed();

-- =====================================================================
-- 3. Снимаем CHECK constraint и маппим существующие данные
-- =====================================================================

-- Имя constraint обычно auto-generated `orders_status_check`. Снимаем все CHECK на status.
DO $$
DECLARE
  v_constraint_name TEXT;
BEGIN
  FOR v_constraint_name IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.orders'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', v_constraint_name);
  END LOOP;
END $$;

-- Маппинг данных. ORDER важен: мапим всё с одинаковым target за один UPDATE.
UPDATE public.orders SET status = 'cancelled'   WHERE status = 'pending_payment';
UPDATE public.orders SET status = 'paid'        WHERE status = 'awaiting_shipment';
UPDATE public.orders SET status = 'sent'        WHERE status IN ('in_transit', 'completed');
UPDATE public.orders SET status = 'return'      WHERE status IN ('return_in_transit', 'return_arrived');
UPDATE public.orders SET status = 'return_done' WHERE status = 'return_completed';
UPDATE public.orders SET status = 'trash'       WHERE status = 'disposed';

-- Меняем дефолт колонки: новый заказ рождается в paid (после Vision/+ВАЙБ).
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'paid';

-- Накладываем новый CHECK с 9 статусами.
ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check CHECK (status IN (
    'paid',
    'collecting',
    'printed',
    'sent',
    'return',
    'return_done',
    'trash',
    'cancelled',
    'problem'
  ));

-- =====================================================================
-- 4. Триггер update_product_quantity_on_order — на новые имена
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_product_quantity_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Отмена заказа до отправки → возвращаем единицу на склад
    IF OLD.status IN ('paid', 'collecting', 'printed', 'problem')
       AND NEW.status = 'cancelled' THEN
      UPDATE public.product_sizes
      SET current_quantity = current_quantity + 1
      WHERE id = NEW.product_size_id;
    -- Возврат принят → возвращаем единицу на склад (и триггерит auto-resume problem-заказов в Phase H)
    ELSIF NEW.status = 'return_done' AND OLD.status != 'return_done' THEN
      UPDATE public.product_sizes
      SET current_quantity = current_quantity + 1
      WHERE id = NEW.product_size_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Триггер уже определён в 20260114000002, тут только функция переписана.
-- Но на всякий случай восстанавливаем его, чтобы не зависеть от порядка применения.
DROP TRIGGER IF EXISTS trigger_update_quantity ON public.orders;
CREATE TRIGGER trigger_update_quantity
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_product_quantity_on_order();

-- =====================================================================
-- 5. View customer_vibe_debt — на новые имена
-- =====================================================================

CREATE OR REPLACE VIEW public.customer_vibe_debt AS
SELECT
  c.id AS customer_id,
  COALESCE(SUM(o.client_price), 0)::NUMERIC(12, 2) AS debt
FROM public.customers c
LEFT JOIN public.orders o
  ON o.customer_id = c.id
  AND o.is_paid = FALSE
  AND o.status NOT IN ('cancelled', 'trash', 'return_done')
GROUP BY c.id;

GRANT SELECT ON public.customer_vibe_debt TO authenticated;

COMMENT ON VIEW public.customer_vibe_debt IS
  'Текущий +ВАЙБ-долг клиента: сумма неоплаченных открытых заказов. Считается on-demand. Возврат (return_done), отмена (cancelled) и утиль (trash) уменьшают долг.';

-- =====================================================================
-- 6. RLS-политики на новые имена статусов
-- =====================================================================

-- orders_select: shipper видит paid (общий пул) + статусы где он работает + историю.
CREATE POLICY orders_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_owner()
    OR (
      public.is_shipper() AND status IN (
        'paid',
        'collecting',
        'printed',
        'sent',
        'return',
        'return_done',
        'trash',
        'problem'
      )
    )
  );

-- orders_realtime_anon: тот же набор (PWA подписывается через anon).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'orders' AND policyname = 'orders_realtime_anon'
  ) THEN
    CREATE POLICY "orders_realtime_anon" ON public.orders FOR SELECT
      TO anon
      USING (status IN (
        'paid',
        'collecting',
        'printed',
        'sent',
        'return',
        'return_done',
        'trash',
        'problem'
      ));
  END IF;
END $$;

-- order_messages: shipper видит сообщения по «активным» заказам.
CREATE POLICY order_messages_shipper_select ON public.order_messages
  FOR SELECT TO authenticated
  USING (
    public.is_shipper()
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = order_messages.order_id
        AND o.status IN ('paid', 'collecting', 'printed', 'sent', 'return', 'problem')
    )
  );

-- =====================================================================
-- 7. Legacy ELO update_shipper_scores — приводим к новым именам.
--    (Будет заменён в Phase E на новую KPI-модель из status_history.)
-- =====================================================================

CREATE OR REPLACE FUNCTION public.update_shipper_scores(p_date DATE)
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
  SELECT
    COALESCE(shipper_payment_mode, 'dynamic'),
    COALESCE(pendulum_rate_min, 100),
    COALESCE(pendulum_rate_max, 250),
    COALESCE(shipper_penalty_rate, 0)
  INTO v_payment_mode, v_rate_min, v_rate_max, v_penalty_rate
  FROM public.settings LIMIT 1;

  IF v_payment_mode = 'fixed' THEN
    RETURN;
  END IF;

  -- Доступные заказы за этот день: «отправленные сегодня» + активные в очереди.
  -- Прежний 'awaiting_shipment' → 'paid'.
  SELECT COUNT(*) INTO v_total_available
  FROM public.orders
  WHERE (
    (shipped_at >= p_date::TIMESTAMP AND shipped_at < (p_date + 1)::TIMESTAMP)
    OR
    (status IN ('paid', 'collecting', 'printed', 'problem')
     AND created_at < (p_date + 1)::TIMESTAMP)
  );

  v_dow := EXTRACT(DOW FROM p_date)::INT;

  SELECT COUNT(*) INTO v_active_shippers
  FROM public.users
  WHERE role = 'shipper'
    AND (work_days IS NULL OR array_length(work_days, 1) IS NULL OR v_dow = ANY(work_days));

  v_active_shippers := GREATEST(v_active_shippers, 1);
  v_available_per_shipper := GREATEST(CEIL(v_total_available::DECIMAL / v_active_shippers), 1);

  FOR rec IN
    SELECT u.id, u.shipper_score, u.work_days AS u_work_days
    FROM public.users u
    WHERE u.role = 'shipper'
  LOOP
    v_work_days := rec.u_work_days;
    v_is_work_day := (v_work_days IS NULL OR array_length(v_work_days, 1) IS NULL OR v_dow = ANY(v_work_days));

    IF NOT v_is_work_day THEN
      CONTINUE;
    END IF;

    v_score := COALESCE(rec.shipper_score, 65);

    SELECT COALESCE(ss.orders_shipped, 0) INTO v_shipped
    FROM public.shipper_stats ss
    WHERE ss.shipper_id = rec.id AND ss.date = p_date;

    IF v_shipped IS NULL THEN v_shipped := 0; END IF;

    INSERT INTO public.shipper_stats (shipper_id, date, orders_shipped, returns_collected, earnings, orders_available)
    VALUES (rec.id, p_date, 0, 0, 0, v_available_per_shipper)
    ON CONFLICT (shipper_id, date) DO UPDATE SET
      orders_available = v_available_per_shipper;

    IF v_total_available = 0 THEN
      CONTINUE;
    END IF;

    SELECT COUNT(*) INTO v_days_worked
    FROM public.shipper_stats
    WHERE shipper_stats.shipper_id = rec.id AND orders_shipped > 0;

    IF v_days_worked < 10 THEN
      CONTINUE;
    END IF;

    v_completion := LEAST(v_shipped::DECIMAL / v_available_per_shipper, 1.0);
    v_k := CASE WHEN v_days_worked < 30 THEN 32 ELSE 10 END;
    v_expected := v_score / 100.0;
    v_raw_delta := v_k * (v_completion - v_expected);

    IF v_raw_delta < 0 THEN
      v_raw_delta := v_raw_delta * 2.0;
    END IF;

    IF v_raw_delta < -8 THEN
      v_raw_delta := -8;
    END IF;

    v_new_score := GREATEST(LEAST(v_score + v_raw_delta, 100), 0);
    v_new_score := ROUND(v_new_score, 2);

    UPDATE public.users SET shipper_score = v_new_score WHERE id = rec.id;

    DECLARE
      v_new_rate DECIMAL(10,2);
      v_day_orders INT;
    BEGIN
      v_new_rate := ROUND(v_rate_min + (v_new_score / 100.0) * (v_rate_max - v_rate_min), 2);

      SELECT orders_shipped INTO v_day_orders
      FROM public.shipper_stats WHERE shipper_stats.shipper_id = rec.id AND date = p_date;

      IF v_day_orders > 0 THEN
        UPDATE public.shipper_stats SET
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

-- =====================================================================
-- 8. cancel_order_auto (из 20260220000003) — приводим к новым именам.
--    Функция помечает заказы как cancelled при истечении срока. В новой
--    модели её роль перейдёт к BullMQ-job `expire-send-by` (Phase C),
--    но сейчас приводим к корректным статусам чтобы не падала.
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'cancel_order_auto'
  ) THEN
    -- Не трогаем тело: `SET status = 'cancelled'` валиден и в новой модели,
    -- легаси-функция продолжит работать на UPDATE без ошибок.
    NULL;
  END IF;
END $$;

COMMENT ON CONSTRAINT orders_status_check ON public.orders IS
  'Канон BUSINESS_LOGIC.md §4.2: 9 статусов клиентского заказа.';

-- Phase H — каскад расхождения склада + автовозобновление problem-заказов.
--
-- BUSINESS_LOGIC §11.2-§11.3:
--   1. Когда отправщик помечает заказ problem с problem_type='out_of_stock' —
--      все остальные активные заказы (paid/collecting/printed) на этот же
--      product_size_id каскадом → problem с linked_return_order_id указанным
--      на этот заказ. SKU+размер автоматически снимается с продажи через
--      product_sizes.current_quantity = 0.
--   2. Когда возврат принят (return_done) и его product_size_id совпадает с
--      product_size_id problem-заказа — БД-триггер зашедулит auto-resume
--      через INSERT в очередь via pg_notify (worker подхватит).
--      Альтернативно: триггер на increment_product_size_quantity и
--      product_sizes.current_quantity > 0 — пробуждаем problem-заказ.
--
-- Принцип: каскад делается серверным триггером на orders (не клиентским кодом),
-- чтобы быть гарантированно атомарным. Авто-resume — через PG-NOTIFY 'auto_resume_problem'.

-- =====================================================================
-- 1. Триггер каскада: orders.status → 'problem' с problem_type='out_of_stock'
-- =====================================================================

CREATE OR REPLACE FUNCTION public.cascade_problem_orders()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Только при переходе в problem с типом out_of_stock.
  IF NEW.status IS DISTINCT FROM 'problem' THEN
    RETURN NEW;
  END IF;
  IF NEW.problem_type IS DISTINCT FROM 'out_of_stock' THEN
    RETURN NEW;
  END IF;
  IF OLD.status IS NOT DISTINCT FROM 'problem' THEN
    -- Уже было в problem — каскадить не нужно.
    RETURN NEW;
  END IF;
  IF NEW.product_size_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- 1a. Каскадим все остальные активные заказы на этот product_size_id.
  UPDATE public.orders
    SET
      status = 'problem',
      problem_type = 'out_of_stock',
      linked_return_order_id = NEW.id,
      system_comment = COALESCE(system_comment, '') ||
        CASE WHEN system_comment IS NULL OR system_comment = '' THEN '' ELSE E'\n' END ||
        'Автокаскад: товара нет на складе (см. заказ #' || NEW.order_number || ').',
      status_history = COALESCE(status_history, '[]'::JSONB) ||
        jsonb_build_object(
          'status', 'problem',
          'timestamp', NOW(),
          'reason', 'cascade_out_of_stock',
          'from_order_id', NEW.id
        )
    WHERE product_size_id = NEW.product_size_id
      AND id <> NEW.id
      AND status IN ('paid', 'collecting', 'printed');

  -- 1b. Снимаем размер с продажи: current_quantity = 0.
  UPDATE public.product_sizes
    SET current_quantity = 0
    WHERE id = NEW.product_size_id
      AND current_quantity > 0;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_cascade_problem ON public.orders;
CREATE TRIGGER trg_orders_cascade_problem
  AFTER UPDATE OF status, problem_type ON public.orders
  FOR EACH ROW
  WHEN (NEW.status = 'problem' AND NEW.problem_type = 'out_of_stock')
  EXECUTE FUNCTION public.cascade_problem_orders();

COMMENT ON FUNCTION public.cascade_problem_orders IS
  'BUSINESS_LOGIC §11.2: при пометке заказа problem/out_of_stock — каскадит остальные активные заказы на тот же product_size_id и снимает размер с продажи (current_quantity=0).';

-- =====================================================================
-- 2. PG-NOTIFY: при росте current_quantity на product_sizes — отправить
--    сигнал в worker'у чтобы зашедулить auto-resume-problem job.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.notify_size_quantity_restored()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Срабатываем когда current_quantity вырос с 0/null на >0.
  IF (OLD.current_quantity IS NULL OR OLD.current_quantity <= 0)
    AND NEW.current_quantity > 0 THEN
    PERFORM pg_notify('auto_resume_problem', NEW.id::TEXT);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_product_sizes_notify_restored ON public.product_sizes;
CREATE TRIGGER trg_product_sizes_notify_restored
  AFTER UPDATE OF current_quantity ON public.product_sizes
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_size_quantity_restored();

COMMENT ON FUNCTION public.notify_size_quantity_restored IS
  'BUSINESS_LOGIC §11.3: при пополнении current_quantity (через возврат return_done или ручную операцию) — посылает pg_notify(auto_resume_problem, product_size_id), worker подхватывает и шедулит BullMQ-job auto-resume-problem.';

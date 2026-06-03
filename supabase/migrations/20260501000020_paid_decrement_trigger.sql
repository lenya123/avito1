-- Симметрия учёта склада, часть 1/4: триггер на orders.UPDATE OF status.
-- Возвращает единицу на склад при cancel из активных статусов или приёме
-- возврата. Расширен на product_id (для размер-less товаров).
--
-- Парные миграции: 20260501000021 (confirm_pending_order_atomic),
--                  20260501000022 (create_order_atomic),
--                  20260501000023 (backfill активных orders).

CREATE OR REPLACE FUNCTION public.update_product_quantity_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  IF (
       OLD.status IN ('paid', 'collecting', 'printed', 'problem')
       AND NEW.status = 'cancelled'
     )
     OR (NEW.status = 'return_done' AND OLD.status <> 'return_done')
  THEN
    IF NEW.product_size_id IS NOT NULL THEN
      UPDATE public.product_sizes
         SET current_quantity = COALESCE(current_quantity, 0) + 1,
             updated_at = NOW()
       WHERE id = NEW.product_size_id;
    ELSIF NEW.product_id IS NOT NULL THEN
      UPDATE public.products
         SET current_quantity = COALESCE(current_quantity, 0) + 1,
             updated_at = NOW()
       WHERE id = NEW.product_id
         AND current_quantity IS NOT NULL;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Симметрия учёта склада, фикс 5/5: убираем updated_at из UPDATE product_sizes
-- — этой колонки в таблице нет (увидели после применения 20-22 в runtime).
-- Для public.products updated_at сохраняем — там колонка есть.

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
         SET current_quantity = COALESCE(current_quantity, 0) + 1
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

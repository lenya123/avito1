-- Триггер update_product_quantity_on_order v3: убрать updated_at = NOW()
-- из UPDATE product_sizes — этой колонки в product_sizes нет (известный
-- техдолг с предыдущих сессий). Из-за этого cancel +ВАЙБ-долгового
-- заказа падал с "column updated_at of relation product_sizes does not exist".

CREATE OR REPLACE FUNCTION public.update_product_quantity_on_order()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_size_text TEXT;
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
    IF NEW.source_kind = 'partner' AND NEW.source_binding_id IS NOT NULL THEN
      SELECT size INTO v_size_text
        FROM public.product_sizes
       WHERE id = NEW.product_size_id;

      IF v_size_text IS NOT NULL THEN
        UPDATE public.product_partner_size_stock
           SET current_quantity = COALESCE(current_quantity, 0) + 1,
               updated_at = NOW()
         WHERE binding_id = NEW.source_binding_id
           AND size = v_size_text;
      END IF;
    ELSIF NEW.product_size_id IS NOT NULL THEN
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

-- Унаследованный баг updated_at: increment_reserved_quantity и
-- decrement_reserved_quantity_safe (из 20260220000003) обновляли
-- product_sizes.updated_at, которой в product_sizes нет. Из app code
-- сейчас не вызываются, но переписываем превентивно — чтобы при будущем
-- вызове не падали. Для public.products updated_at сохраняем.

CREATE OR REPLACE FUNCTION public.increment_reserved_quantity(
  target_size_id UUID DEFAULT NULL,
  target_product_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_size_id IS NOT NULL THEN
    UPDATE public.product_sizes
       SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
     WHERE id = target_size_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product size % not found', target_size_id;
    END IF;
  ELSIF target_product_id IS NOT NULL THEN
    UPDATE public.products
       SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1,
           updated_at = NOW()
     WHERE id = target_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', target_product_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Either target_size_id or target_product_id must be provided';
  END IF;
END;
$$;

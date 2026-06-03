-- Парная к 30: decrement_reserved_quantity_safe тоже обновлял
-- product_sizes.updated_at. Переписываем без него.

CREATE OR REPLACE FUNCTION public.decrement_reserved_quantity_safe(
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
       SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
     WHERE id = target_size_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product size % not found', target_size_id;
    END IF;
  ELSIF target_product_id IS NOT NULL THEN
    UPDATE public.products
       SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0),
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

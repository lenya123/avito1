-- Унаследованный баг: increment_product_size_quantity (из 20250121) ссылается
-- на updated_at, которой в product_sizes нет. До этой миграции вызовы из
-- shipper-actions.ts (executeChangeSize) тихо падали в runtime. Теперь, когда
-- убраны дублирующие вызовы из restoreStock/batch/linked-orders, это
-- остаётся единственным callsite-ом и должен работать корректно.

CREATE OR REPLACE FUNCTION public.increment_product_size_quantity(
  size_id UUID,
  amount INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.product_sizes
     SET current_quantity = current_quantity + amount
   WHERE id = size_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product size % not found', size_id;
  END IF;
END;
$$;

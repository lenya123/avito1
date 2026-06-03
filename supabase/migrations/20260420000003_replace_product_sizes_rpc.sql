-- Polish (P1 #8): атомарный replace_product_sizes RPC
-- Устраняет race между DELETE и INSERT в PATCH товара — товар никогда не остаётся без размеров

CREATE OR REPLACE FUNCTION public.replace_product_sizes(
  p_product_id UUID,
  p_sizes JSONB
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total INT := 0;
BEGIN
  IF p_sizes IS NULL OR jsonb_typeof(p_sizes) <> 'array' OR jsonb_array_length(p_sizes) = 0 THEN
    RAISE EXCEPTION 'replace_product_sizes requires non-empty JSONB array'
      USING ERRCODE = '22023';
  END IF;

  DELETE FROM public.product_sizes WHERE product_id = p_product_id;

  INSERT INTO public.product_sizes (product_id, size, initial_quantity, current_quantity)
  SELECT
    p_product_id,
    (item->>'size')::TEXT,
    COALESCE((item->>'initial_quantity')::INT, 0),
    COALESCE((item->>'current_quantity')::INT, 0)
  FROM jsonb_array_elements(p_sizes) AS item;

  SELECT COALESCE(SUM(initial_quantity), 0) INTO v_total
    FROM public.product_sizes WHERE product_id = p_product_id;

  UPDATE public.products SET purchase_quantity = v_total WHERE id = p_product_id;

  RETURN v_total;
END $$;

GRANT EXECUTE ON FUNCTION public.replace_product_sizes(UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.replace_product_sizes IS
  'Атомарная замена размеров товара. DELETE + INSERT + UPDATE products.purchase_quantity в одной транзакции. Входной JSONB — массив {size, initial_quantity, current_quantity}.';

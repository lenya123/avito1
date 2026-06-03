-- create_first_batch: при создании товара заводит «Партию 1» из его
-- текущих размеров (snapshot initial_quantity) с указанной ценой и
-- пересчитывает «всего закуплено»/среднюю закупочную. Идемпотентно:
-- если партии уже есть — ничего не делает. Канон §11.5.
-- (Существующим товарам Партия 1 заведена backfill-ом в 20260518000040.)

CREATE OR REPLACE FUNCTION public.create_first_batch(
  p_product_id UUID,
  p_price      NUMERIC
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sizes JSONB;
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_batches WHERE product_id = p_product_id) THEN
    RETURN;
  END IF;

  SELECT COALESCE(
           jsonb_agg(jsonb_build_object(
             'size_id', ps.id,
             'size', ps.size,
             'quantity', ps.initial_quantity
           )),
           '[]'::jsonb
         )
    INTO v_sizes
    FROM public.product_sizes ps
   WHERE ps.product_id = p_product_id;

  INSERT INTO public.product_batches (product_id, batch_number, purchase_price, sizes)
  VALUES (p_product_id, 1, COALESCE(p_price, 0), v_sizes);

  PERFORM public._recompute_product_from_batches(p_product_id);
END $$;

GRANT EXECUTE ON FUNCTION public.create_first_batch(UUID, NUMERIC) TO service_role;

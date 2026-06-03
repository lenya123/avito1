-- set_product_size_measurements: проставить замеры пер-размер (§11.6)
-- при редактировании товара. p_data = [{ "size": text, "measurements": jsonb }].
-- Пустой объект замеров → NULL (нет замеров). Атомарно.

CREATE OR REPLACE FUNCTION public.set_product_size_measurements(
  p_product_id UUID,
  p_data       JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item JSONB;
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'array' THEN
    RETURN;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_data) LOOP
    UPDATE public.product_sizes
       SET measurements = CASE
         WHEN jsonb_typeof(v_item->'measurements') = 'object'
           AND v_item->'measurements' <> '{}'::jsonb
         THEN v_item->'measurements'
         ELSE NULL
       END
     WHERE product_id = p_product_id
       AND size = (v_item->>'size');
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION
  public.set_product_size_measurements(UUID, JSONB) TO service_role;

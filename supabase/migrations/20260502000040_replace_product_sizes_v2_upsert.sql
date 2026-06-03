-- replace_product_sizes v2: UPSERT вместо DELETE+INSERT.
--
-- Старый вариант падал FK-ошибкой при любом редактировании товара,
-- если хоть на один размер был оформлен заказ — DELETE FROM product_sizes
-- ловил `orders_product_size_id_fkey`. Из-за этого нельзя было
-- переключить флаги (партнёр/склад/премиум/...) или поправить цену
-- у товара с историей.
--
-- Новая логика:
--   1. UPSERT (product_id, size) — обновляет existing, вставляет новые.
--   2. DELETE только тех размеров, которых НЕТ во входных данных И
--      на которые нет ссылок из orders (orphan rows).
--   3. Размеры, которые пользователь убрал из формы, но имеющие orders —
--      остаются в таблице (FK сохраняем). Чтобы реально вывести такой
--      размер, владелец должен сначала закрыть/удалить старые orders.
--
-- UNIQUE(product_id, size) уже существует с миграции 20260111000001.

CREATE OR REPLACE FUNCTION public.replace_product_sizes(
  p_product_id UUID,
  p_sizes JSONB
) RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_total INT := 0;
  v_input_sizes TEXT[];
BEGIN
  IF p_sizes IS NULL OR jsonb_typeof(p_sizes) <> 'array' OR jsonb_array_length(p_sizes) = 0 THEN
    RAISE EXCEPTION 'replace_product_sizes requires non-empty JSONB array'
      USING ERRCODE = '22023';
  END IF;

  -- Список размеров из входных данных (уникальные значения).
  SELECT array_agg(DISTINCT (item->>'size')::TEXT) INTO v_input_sizes
    FROM jsonb_array_elements(p_sizes) AS item;

  -- Удаляем размеры, которых нет во входных данных И не используются в orders.
  -- Те, что используются, остаются как «исторический» след.
  DELETE FROM public.product_sizes ps
   WHERE ps.product_id = p_product_id
     AND ps.size <> ALL(v_input_sizes)
     AND NOT EXISTS (
       SELECT 1 FROM public.orders o WHERE o.product_size_id = ps.id
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.pending_orders po WHERE po.product_size_id = ps.id
     );

  -- UPSERT: обновляем existing, вставляем недостающие.
  INSERT INTO public.product_sizes (product_id, size, initial_quantity, current_quantity)
  SELECT
    p_product_id,
    (item->>'size')::TEXT,
    COALESCE((item->>'initial_quantity')::INT, 0),
    COALESCE((item->>'current_quantity')::INT, 0)
  FROM jsonb_array_elements(p_sizes) AS item
  ON CONFLICT (product_id, size) DO UPDATE
    SET initial_quantity = EXCLUDED.initial_quantity,
        current_quantity = EXCLUDED.current_quantity;

  SELECT COALESCE(SUM(initial_quantity), 0) INTO v_total
    FROM public.product_sizes WHERE product_id = p_product_id;

  UPDATE public.products SET purchase_quantity = v_total WHERE id = p_product_id;

  RETURN v_total;
END $$;

GRANT EXECUTE ON FUNCTION public.replace_product_sizes(UUID, JSONB) TO service_role;

COMMENT ON FUNCTION public.replace_product_sizes IS
  'v2: UPSERT по (product_id, size). DELETE только для orphan-размеров без ссылок из orders/pending_orders.';

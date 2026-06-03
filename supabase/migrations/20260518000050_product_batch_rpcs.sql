-- RPC управления партиями (атомарные, метод проекта). Канон §11.5.
--
-- Инварианты, пересчитываются из партий при ЛЮБОМ изменении:
--   product_sizes.initial_quantity[size] = Σ quantity по всем партиям;
--   products.purchase_quantity           = Σ initial_quantity;
--   products.purchase_price              = СРЕДНЕВЗВЕШЕННАЯ
--       = Σ(цена_партии × штук_в_партии) / Σ(штук_в_партии).
-- Остаток (current_quantity) — единый пул, двигается на дельту партии
-- при add/edit/delete, НИКОГДА не уходит в минус (GREATEST(0, …)).

CREATE OR REPLACE FUNCTION public._recompute_product_from_batches(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- «всего закуплено» по размеру = Σ по партиям
  UPDATE public.product_sizes ps
     SET initial_quantity = sub.q
    FROM (
      SELECT (e->>'size_id')::UUID AS sid,
             SUM((e->>'quantity')::INT) AS q
        FROM public.product_batches b,
             jsonb_array_elements(b.sizes) e
       WHERE b.product_id = p_product_id
       GROUP BY 1
    ) sub
   WHERE ps.id = sub.sid AND ps.product_id = p_product_id;

  -- зеркало «всего закуплено» на товаре
  UPDATE public.products
     SET purchase_quantity = (
       SELECT COALESCE(SUM(initial_quantity), 0)
         FROM public.product_sizes WHERE product_id = p_product_id
     )
   WHERE id = p_product_id;

  -- средневзвешенная закупочная (всего потрачено ÷ всего куплено)
  UPDATE public.products
     SET purchase_price = COALESCE((
       WITH bt AS (
         SELECT b.purchase_price AS price,
                (SELECT COALESCE(SUM((e->>'quantity')::INT), 0)
                   FROM jsonb_array_elements(b.sizes) e) AS units
           FROM public.product_batches b
          WHERE b.product_id = p_product_id
       )
       SELECT ROUND(SUM(price * units)::NUMERIC / NULLIF(SUM(units), 0), 2)
         FROM bt
     ), purchase_price)
   WHERE id = p_product_id;
END $$;


-- Добавить партию (+ остаток по размерам растёт)
CREATE OR REPLACE FUNCTION public.add_product_batch(
  p_product_id UUID,
  p_price      NUMERIC,
  p_sizes      JSONB
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num   INT;
  v_item  JSONB;
  v_sid   UUID;
  v_qty   INT;
BEGIN
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'add_product_batch: price must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_sizes IS NULL OR jsonb_typeof(p_sizes) <> 'array'
     OR jsonb_array_length(p_sizes) = 0 THEN
    RAISE EXCEPTION 'add_product_batch: sizes must be non-empty array'
      USING ERRCODE = '22023';
  END IF;

  SELECT COALESCE(MAX(batch_number), 0) + 1 INTO v_num
    FROM public.product_batches WHERE product_id = p_product_id;

  INSERT INTO public.product_batches (product_id, batch_number, purchase_price, sizes)
  VALUES (p_product_id, v_num, p_price, p_sizes);

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_sizes) LOOP
    v_sid := (v_item->>'size_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;
    IF v_qty IS NULL OR v_qty < 0 THEN
      RAISE EXCEPTION 'add_product_batch: quantity must be >= 0' USING ERRCODE = '22023';
    END IF;
    IF v_qty > 0 THEN
      UPDATE public.product_sizes
         SET current_quantity = current_quantity + v_qty
       WHERE id = v_sid AND product_id = p_product_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'add_product_batch: size % not in product %', v_sid, p_product_id
          USING ERRCODE = '22023';
      END IF;
    END IF;
  END LOOP;

  PERFORM public._recompute_product_from_batches(p_product_id);
  RETURN jsonb_build_object('batch_number', v_num);
END $$;

GRANT EXECUTE ON FUNCTION public.add_product_batch(UUID, NUMERIC, JSONB) TO service_role;


-- Править партию (цена и/или размеры). Остаток двигается на дельту, clamp >=0.
CREATE OR REPLACE FUNCTION public.edit_product_batch(
  p_batch_id UUID,
  p_price    NUMERIC,
  p_sizes    JSONB
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid   UUID;
  v_old   JSONB;
  v_sid   UUID;
  v_delta INT;
BEGIN
  IF p_price IS NULL OR p_price < 0 THEN
    RAISE EXCEPTION 'edit_product_batch: price must be >= 0' USING ERRCODE = '22023';
  END IF;
  IF p_sizes IS NULL OR jsonb_typeof(p_sizes) <> 'array' THEN
    RAISE EXCEPTION 'edit_product_batch: sizes must be array' USING ERRCODE = '22023';
  END IF;

  SELECT product_id, sizes INTO v_pid, v_old
    FROM public.product_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'edit_product_batch: batch % not found', p_batch_id
      USING ERRCODE = '22023';
  END IF;

  -- дельта по каждому size_id из объединения старого и нового набора
  FOR v_sid, v_delta IN
    SELECT sid,
           COALESCE(SUM(new_q), 0) - COALESCE(SUM(old_q), 0) AS delta
      FROM (
        SELECT (e->>'size_id')::UUID AS sid,
               (e->>'quantity')::INT AS new_q, 0 AS old_q
          FROM jsonb_array_elements(p_sizes) e
        UNION ALL
        SELECT (e->>'size_id')::UUID AS sid,
               0 AS new_q, (e->>'quantity')::INT AS old_q
          FROM jsonb_array_elements(v_old) e
      ) u
     GROUP BY sid
  LOOP
    IF v_delta <> 0 THEN
      UPDATE public.product_sizes
         SET current_quantity = GREATEST(0, current_quantity + v_delta)
       WHERE id = v_sid AND product_id = v_pid;
    END IF;
  END LOOP;

  UPDATE public.product_batches
     SET purchase_price = p_price, sizes = p_sizes
   WHERE id = p_batch_id;

  PERFORM public._recompute_product_from_batches(v_pid);
END $$;

GRANT EXECUTE ON FUNCTION public.edit_product_batch(UUID, NUMERIC, JSONB) TO service_role;


-- Удалить партию. Нельзя удалить единственную (товар без партий = нет
-- закупочной базы). Остаток уменьшается на её размеры, clamp >=0.
CREATE OR REPLACE FUNCTION public.delete_product_batch(p_batch_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid   UUID;
  v_sizes JSONB;
  v_cnt   INT;
  v_item  JSONB;
  v_sid   UUID;
  v_qty   INT;
BEGIN
  SELECT product_id, sizes INTO v_pid, v_sizes
    FROM public.product_batches WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'delete_product_batch: batch % not found', p_batch_id
      USING ERRCODE = '22023';
  END IF;

  SELECT COUNT(*) INTO v_cnt
    FROM public.product_batches WHERE product_id = v_pid;
  IF v_cnt <= 1 THEN
    RAISE EXCEPTION 'delete_product_batch: cannot delete the only batch'
      USING ERRCODE = '22023';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_sizes) LOOP
    v_sid := (v_item->>'size_id')::UUID;
    v_qty := (v_item->>'quantity')::INT;
    IF v_qty > 0 THEN
      UPDATE public.product_sizes
         SET current_quantity = GREATEST(0, current_quantity - v_qty)
       WHERE id = v_sid AND product_id = v_pid;
    END IF;
  END LOOP;

  DELETE FROM public.product_batches WHERE id = p_batch_id;

  PERFORM public._recompute_product_from_batches(v_pid);
END $$;

GRANT EXECUTE ON FUNCTION public.delete_product_batch(UUID) TO service_role;

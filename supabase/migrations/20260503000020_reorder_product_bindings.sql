-- reorder_product_bindings: атомарно проставляет priority=1..N в порядке массива.
-- Используется UI-ом owner panel после drag-and-drop карточек привязок.
-- Защита: все binding_id из массива должны принадлежать p_product_id (иначе RAISE).
--
-- Алгоритм: сначала пишем priority с большим offset (10000+i), потом переписываем
-- финальные значения 1..N. Это обходит проблему уникальности priority при swap'е,
-- если индекс по (product_id, priority) когда-нибудь сделают уникальным.

CREATE OR REPLACE FUNCTION public.reorder_product_bindings(
  p_product_id           UUID,
  p_ordered_binding_ids  UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_count INTEGER;
  v_id    UUID;
  v_idx   INTEGER;
BEGIN
  -- Все binding'и должны принадлежать товару и быть живыми.
  SELECT COUNT(*) INTO v_count
    FROM public.product_partner_bindings
   WHERE id = ANY(p_ordered_binding_ids)
     AND product_id = p_product_id
     AND deleted_at IS NULL;

  IF v_count <> array_length(p_ordered_binding_ids, 1) THEN
    RAISE EXCEPTION 'BINDINGS_NOT_FOUND_OR_FOREIGN' USING ERRCODE = 'P0002';
  END IF;

  -- Большой offset (на случай UNIQUE index).
  v_idx := 10000;
  FOREACH v_id IN ARRAY p_ordered_binding_ids LOOP
    UPDATE public.product_partner_bindings
       SET priority = v_idx, updated_at = NOW()
     WHERE id = v_id;
    v_idx := v_idx + 1;
  END LOOP;

  -- Финальные значения 1..N.
  v_idx := 1;
  FOREACH v_id IN ARRAY p_ordered_binding_ids LOOP
    UPDATE public.product_partner_bindings
       SET priority = v_idx, updated_at = NOW()
     WHERE id = v_id;
    v_idx := v_idx + 1;
  END LOOP;
END;
$func$;

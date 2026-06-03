-- reconcile_product_stock: атомарная сверка инвентаризации (физпересчёт
-- отправщика vs системный остаток). ОДНА транзакция:
--   читаем системный остаток → если факт ≠ система пишем событие в
--   stock_reconciliations → авто-сверка current := факт.
--
-- До этого логика жила инлайном в роуте /api/shipper/stock/[id] по шагам
-- без транзакции: при обрыве между INSERT в журнал и UPDATE остатка
-- аудит-журнал расходился с реальностью. Плюс ветка One Size (товар без
-- размеров) была пустой — недостача по таким товарам не фиксировалась
-- вообще. Эта RPC закрывает оба: размерные и One Size единообразно,
-- атомарно, по методу проекта (ср. replace_product_sizes / *_atomic).
--
-- Контракт:
--   p_sizes        — JSONB-массив [{ "size_id": uuid, "counted": int }]
--                    (инвентаризация по размерам) или NULL/[].
--   p_no_size_count — физфакт для товара БЕЗ размеров или NULL.
--   p_by           — users.id отправщика-исполнителя (nullable, FK SET NULL).
-- Возвращает сводку {"events","loss_units","surplus_units"}.
--
-- delta = system_before − counted: >0 недостача, <0 излишек.
-- ₽ потери считается на чтении по purchase_price_snapshot (фиксируем здесь
-- закупочную на момент сверки). Нулевой delta событие НЕ пишет.

CREATE OR REPLACE FUNCTION public.reconcile_product_stock(
  p_product_id    UUID,
  p_sizes         JSONB,
  p_no_size_count INT,
  p_by            UUID
) RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pp        NUMERIC;
  v_item      JSONB;
  v_size_id   UUID;
  v_counted   INT;
  v_sys       INT;
  v_size      TEXT;
  v_delta     INT;
  v_events    INT := 0;
  v_loss      INT := 0;
  v_surplus   INT := 0;
BEGIN
  SELECT purchase_price INTO v_pp
    FROM public.products WHERE id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reconcile_product_stock: product % not found', p_product_id
      USING ERRCODE = '22023';
  END IF;
  v_pp := COALESCE(v_pp, 0);

  -- ===== Размерная инвентаризация =====
  IF p_sizes IS NOT NULL AND jsonb_typeof(p_sizes) = 'array' THEN
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_sizes) LOOP
      v_size_id := (v_item->>'size_id')::UUID;
      v_counted := (v_item->>'counted')::INT;

      SELECT current_quantity, size INTO v_sys, v_size
        FROM public.product_sizes
       WHERE id = v_size_id AND product_id = p_product_id
       FOR UPDATE;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'reconcile_product_stock: size % not in product %',
          v_size_id, p_product_id USING ERRCODE = '22023';
      END IF;

      v_delta := v_sys - v_counted;
      IF v_delta <> 0 THEN
        INSERT INTO public.stock_reconciliations (
          product_id, product_size_id, size, system_before, counted,
          delta, purchase_price_snapshot, reconciled_by
        ) VALUES (
          p_product_id, v_size_id, v_size, v_sys, v_counted,
          v_delta, v_pp, p_by
        );
        v_events := v_events + 1;
        IF v_delta > 0 THEN v_loss := v_loss + v_delta;
        ELSE v_surplus := v_surplus + (-v_delta); END IF;
      END IF;

      -- Авто-сверка: система принимает физфакт за истину.
      -- UPDATE current_quantity триггерит пересчёт is_in_stock в той же
      -- транзакции (product_sizes_sync_stock_upd).
      UPDATE public.product_sizes
         SET current_quantity = v_counted,
             actual_quantity  = v_counted
       WHERE id = v_size_id;
    END LOOP;
  END IF;

  -- ===== One Size (товар без размеров) =====
  IF p_no_size_count IS NOT NULL THEN
    SELECT current_quantity INTO v_sys
      FROM public.products WHERE id = p_product_id FOR UPDATE;

    v_delta := COALESCE(v_sys, 0) - p_no_size_count;
    IF v_delta <> 0 THEN
      INSERT INTO public.stock_reconciliations (
        product_id, product_size_id, size, system_before, counted,
        delta, purchase_price_snapshot, reconciled_by
      ) VALUES (
        p_product_id, NULL, NULL, COALESCE(v_sys, 0), p_no_size_count,
        v_delta, v_pp, p_by
      );
      v_events := v_events + 1;
      IF v_delta > 0 THEN v_loss := v_loss + v_delta;
      ELSE v_surplus := v_surplus + (-v_delta); END IF;
    END IF;

    UPDATE public.products
       SET current_quantity = p_no_size_count,
           actual_quantity  = p_no_size_count,
           is_in_stock      = (p_no_size_count > 0)
     WHERE id = p_product_id;
  END IF;

  RETURN jsonb_build_object(
    'events', v_events,
    'loss_units', v_loss,
    'surplus_units', v_surplus
  );
END $$;

GRANT EXECUTE ON FUNCTION
  public.reconcile_product_stock(UUID, JSONB, INT, UUID) TO service_role;

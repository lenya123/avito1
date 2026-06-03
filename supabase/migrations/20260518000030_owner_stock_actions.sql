-- Два явных действия владельца над остатком размера (атомарные RPC).
-- Раньше остаток правился одним полем-угадайкой (replace_product_sizes
-- set-absolute + initial=GREATEST) — нельзя было отличить «пришла партия»
-- (потрачены деньги, закупленное растёт) от «поправил факт» (денег нет).
-- Та же модель ещё и занижала «всего закуплено» после связки продажи+
-- докупка. Разделяем на два честных действия:
--
--   restock_product_size        — «Пришла партия» (+N): current += N,
--                                 initial += N, products.purchase_quantity
--                                 пересчитывается = SUM(initial). Это
--                                 единственное «потрачены деньги».
--   correct_product_size_quantity — «Поправка» (=M, не потеря/не излишек):
--                                 current := M, initial НЕ трогаем, событие
--                                 НЕ пишем. Тихая коррекция опечатки.
--
-- Потеря/излишек при «Поправить остаток» идут через уже существующий
-- атомарный reconcile_product_stock (owner как reconciled_by) — единая
-- логика сверки на весь проект. Канон §11.4.
--
-- One Size = строка product_sizes с size='One Size' → обе RPC работают
-- по size_id единообразно с обычными размерами.

CREATE OR REPLACE FUNCTION public.restock_product_size(
  p_product_id UUID,
  p_size_id    UUID,
  p_qty        INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total INT;
BEGIN
  IF p_qty IS NULL OR p_qty <= 0 THEN
    RAISE EXCEPTION 'restock_product_size: qty must be > 0 (got %)', p_qty
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.product_sizes
     SET current_quantity = current_quantity + p_qty,
         initial_quantity = initial_quantity + p_qty
   WHERE id = p_size_id AND product_id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'restock_product_size: size % not in product %',
      p_size_id, p_product_id USING ERRCODE = '22023';
  END IF;

  -- Зеркало «всего закуплено» на products = сумма initial по размерам.
  SELECT COALESCE(SUM(initial_quantity), 0) INTO v_total
    FROM public.product_sizes WHERE product_id = p_product_id;
  UPDATE public.products SET purchase_quantity = v_total
   WHERE id = p_product_id;
END $$;

GRANT EXECUTE ON FUNCTION
  public.restock_product_size(UUID, UUID, INT) TO service_role;


CREATE OR REPLACE FUNCTION public.correct_product_size_quantity(
  p_product_id UUID,
  p_size_id    UUID,
  p_qty        INT
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_qty IS NULL OR p_qty < 0 THEN
    RAISE EXCEPTION 'correct_product_size_quantity: qty must be >= 0 (got %)', p_qty
      USING ERRCODE = '22023';
  END IF;

  -- Тихая коррекция: ставим остаток как есть, базовую планку
  -- (initial_quantity / закуплено) НЕ трогаем, событие недостачи НЕ пишем.
  -- Пересчёт is_in_stock — триггером product_sizes_sync_stock_upd.
  UPDATE public.product_sizes
     SET current_quantity = p_qty
   WHERE id = p_size_id AND product_id = p_product_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'correct_product_size_quantity: size % not in product %',
      p_size_id, p_product_id USING ERRCODE = '22023';
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION
  public.correct_product_size_quantity(UUID, UUID, INT) TO service_role;

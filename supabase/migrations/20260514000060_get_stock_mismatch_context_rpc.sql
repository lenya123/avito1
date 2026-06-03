-- RPC: метрики для DM владельцу при out_of_stock-расхождении склада.
-- BUSINESS_LOGIC §11.4. Возвращает текущий остаток + сколько заказов
-- застряло в problem + что есть в возвратах (в пути / уже на ПВЗ) +
-- ближайшую ожидаемую дату прибытия.
--
-- Эффективная дата прибытия:
--   * NULL  → дроп-возврат, клиент уже отметил «приехал на ПВЗ» (по канону
--     §6.4 статус 'return' для дропа = возврат на ПВЗ).
--   * <= CURRENT_DATE → уже прибыл (Авито или дроп с явной датой в прошлом).
--   * >  CURRENT_DATE → ещё в пути (Авито с датой в будущем).
CREATE OR REPLACE FUNCTION get_stock_mismatch_context(p_product_size_id UUID)
RETURNS JSON
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_product_name TEXT;
  v_size TEXT;
  v_current_quantity INT;
  v_problem_count INT;
  v_in_transit_count INT;
  v_on_pvz_count INT;
  v_nearest_expected DATE;
BEGIN
  SELECT p.name, ps.size, ps.current_quantity
    INTO v_product_name, v_size, v_current_quantity
  FROM product_sizes ps
  JOIN products p ON p.id = ps.product_id
  WHERE ps.id = p_product_size_id;

  SELECT COUNT(*)::INT INTO v_problem_count
  FROM orders
  WHERE product_size_id = p_product_size_id
    AND status = 'problem'
    AND problem_type = 'out_of_stock';

  SELECT
    COUNT(*) FILTER (
      WHERE expected_return_date IS NOT NULL AND expected_return_date > CURRENT_DATE
    )::INT,
    COUNT(*) FILTER (
      WHERE expected_return_date IS NULL OR expected_return_date <= CURRENT_DATE
    )::INT,
    MIN(expected_return_date) FILTER (
      WHERE expected_return_date IS NOT NULL AND expected_return_date > CURRENT_DATE
    )
  INTO v_in_transit_count, v_on_pvz_count, v_nearest_expected
  FROM orders
  WHERE product_size_id = p_product_size_id
    AND status = 'return';

  RETURN json_build_object(
    'product_name', v_product_name,
    'size', v_size,
    'current_quantity', v_current_quantity,
    'problem_count', v_problem_count,
    'in_transit_count', v_in_transit_count,
    'on_pvz_count', v_on_pvz_count,
    'nearest_expected_return', v_nearest_expected
  );
END;
$$;

GRANT EXECUTE ON FUNCTION get_stock_mismatch_context(UUID) TO service_role, authenticated;

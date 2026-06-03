-- Автовычисление products.is_in_stock из product_sizes
--
-- Цель: сделать is_in_stock производным от реального стока по размерам.
-- Триггер пересчитывает флаг при любом INSERT/UPDATE/DELETE на product_sizes.
-- Скип бессмысленных UPDATE защищает hot-path резерваций от cascade'ов.
--
-- Ручной override is_in_stock через форму редактирования товара сохраняется
-- до ближайшего изменения размеров (продажа, правка размера) — тогда
-- синхронизируется с реальным остатком.

BEGIN;

-- === Функция пересчёта ===
-- SECURITY DEFINER — чтобы UPDATE products работал даже если вызывающая роль
-- не имеет прямого UPDATE-прав на products.
-- Отрицательные суммы (баг в другом коде) трактуются как "нет в наличии".
CREATE OR REPLACE FUNCTION recompute_product_in_stock(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sum INT;
  v_should_be_in_stock BOOLEAN;
  v_current BOOLEAN;
BEGIN
  SELECT COALESCE(SUM(current_quantity - COALESCE(reserved_quantity, 0)), 0)
    INTO v_sum
    FROM product_sizes
    WHERE product_id = p_product_id;

  v_should_be_in_stock := (v_sum > 0);

  SELECT is_in_stock INTO v_current FROM products WHERE id = p_product_id;

  -- Скип бессмысленного UPDATE: hot-path резерваций, и без этого скипа
  -- мы бы флипали trigger_product_arrival впустую.
  IF v_current IS DISTINCT FROM v_should_be_in_stock THEN
    UPDATE products
      SET is_in_stock = v_should_be_in_stock
      WHERE id = p_product_id;
  END IF;
END $$;

-- === Триггер-функция на product_sizes ===
CREATE OR REPLACE FUNCTION trg_product_sizes_recompute_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_product_in_stock(OLD.product_id);
  ELSE
    PERFORM recompute_product_in_stock(NEW.product_id);
  END IF;
  RETURN NULL;
END $$;

-- === Триггеры на product_sizes ===
-- Postgres не разрешает комбинировать UPDATE OF columns с INSERT/DELETE
-- в одном CREATE TRIGGER, поэтому нужны два.

DROP TRIGGER IF EXISTS product_sizes_sync_stock_iud ON product_sizes;
CREATE TRIGGER product_sizes_sync_stock_iud
AFTER INSERT OR DELETE
ON product_sizes
FOR EACH ROW EXECUTE FUNCTION trg_product_sizes_recompute_stock();

DROP TRIGGER IF EXISTS product_sizes_sync_stock_upd ON product_sizes;
CREATE TRIGGER product_sizes_sync_stock_upd
AFTER UPDATE OF current_quantity, reserved_quantity
ON product_sizes
FOR EACH ROW EXECUTE FUNCTION trg_product_sizes_recompute_stock();

-- === Бэкфил существующих данных ===
-- session_replication_role = 'replica' отключает пользовательские триггеры
-- на время этой транзакции — иначе trigger_product_arrival разошлёт
-- push-уведомления о "возврате в наличие" на все товары, которые по факту
-- были в стоке всё время (просто флаг врал).
SET LOCAL session_replication_role = 'replica';

UPDATE products p
SET is_in_stock = (
  COALESCE(
    (SELECT SUM(current_quantity - COALESCE(reserved_quantity, 0))
     FROM product_sizes ps WHERE ps.product_id = p.id),
    0
  ) > 0
)
WHERE is_in_stock IS DISTINCT FROM (
  COALESCE(
    (SELECT SUM(current_quantity - COALESCE(reserved_quantity, 0))
     FROM product_sizes ps WHERE ps.product_id = p.id),
    0
  ) > 0
);

SET LOCAL session_replication_role = 'origin';

COMMIT;

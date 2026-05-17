-- actual_quantity: фактическое наличие по данным отправщика
-- NULL = ещё не проверено. Изолирован от current/initial/reserved.

-- Для товаров с размерами
ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS actual_quantity INT DEFAULT NULL;

-- Для товаров без размеров
ALTER TABLE products ADD COLUMN IF NOT EXISTS actual_quantity INT DEFAULT NULL;

-- RPC: изменить actual_quantity для размера (если не NULL)
CREATE OR REPLACE FUNCTION adjust_actual_quantity(
  target_size_id UUID,
  delta INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE product_sizes
  SET actual_quantity = GREATEST(0, actual_quantity + delta),
      updated_at = now()
  WHERE id = target_size_id
    AND actual_quantity IS NOT NULL;
END;
$$;

-- RPC: изменить actual_quantity для товара без размеров (если не NULL)
CREATE OR REPLACE FUNCTION adjust_product_actual_quantity(
  target_product_id UUID,
  delta INT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE products
  SET actual_quantity = GREATEST(0, actual_quantity + delta),
      updated_at = now()
  WHERE id = target_product_id
    AND actual_quantity IS NOT NULL;
END;
$$;

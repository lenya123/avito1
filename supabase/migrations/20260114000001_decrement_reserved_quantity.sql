-- Атомарная функция для уменьшения reserved_quantity
CREATE OR REPLACE FUNCTION decrement_reserved_quantity(size_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE product_sizes
  SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
  WHERE id = size_id;
END;
$$;

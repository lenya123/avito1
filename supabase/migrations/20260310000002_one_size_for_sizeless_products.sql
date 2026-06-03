-- Для товаров без размеров создаём запись "One Size" в product_sizes,
-- чтобы количество отображалось единообразно через ту же систему.
INSERT INTO product_sizes (product_id, size, initial_quantity, current_quantity, reserved_quantity)
SELECT
  p.id,
  'One Size',
  COALESCE(p.purchase_quantity, p.current_quantity, 0),
  COALESCE(p.current_quantity, 0),
  COALESCE(p.reserved_quantity, 0)
FROM products p
WHERE NOT EXISTS (
  SELECT 1 FROM product_sizes ps WHERE ps.product_id = p.id
);

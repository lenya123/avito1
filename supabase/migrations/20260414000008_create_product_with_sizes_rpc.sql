-- ============================================================================
-- Multi-seller phase A.10: атомарное создание товара с размерами
-- ============================================================================
-- Единая транзакция для создания product + product_sizes. Заменяет
-- двухшаговый insert в /api/seller/products и /api/owner/products.

CREATE OR REPLACE FUNCTION create_product_with_sizes(
  p_product JSONB,
  p_sizes JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_product_id UUID;
  v_size JSONB;
BEGIN
  INSERT INTO products (
    name,
    brand,
    category,
    description,
    purchase_price,
    drop_price,
    recommended_price,
    photo_urls,
    is_premium,
    is_active,
    expected_arrival_date,
    measurements,
    location_city,
    seller_id,
    created_by,
    purchase_quantity
  ) VALUES (
    p_product->>'name',
    p_product->>'brand',
    p_product->>'category',
    p_product->>'description',
    (p_product->>'purchase_price')::NUMERIC,
    (p_product->>'drop_price')::NUMERIC,
    NULLIF(p_product->>'recommended_price', '')::NUMERIC,
    ARRAY(SELECT jsonb_array_elements_text(p_product->'photo_urls')),
    COALESCE((p_product->>'is_premium')::BOOLEAN, FALSE),
    COALESCE((p_product->>'is_active')::BOOLEAN, TRUE),
    NULLIF(p_product->>'expected_arrival_date', '')::DATE,
    p_product->'measurements',
    NULLIF(p_product->>'location_city', ''),
    (p_product->>'seller_id')::UUID,
    (p_product->>'seller_id')::UUID,
    COALESCE((p_product->>'purchase_quantity')::INT, 0)
  ) RETURNING id INTO v_product_id;

  FOR v_size IN SELECT * FROM jsonb_array_elements(p_sizes) LOOP
    INSERT INTO product_sizes (
      product_id,
      size,
      initial_quantity,
      current_quantity
    ) VALUES (
      v_product_id,
      v_size->>'size',
      (v_size->>'quantity')::INT,
      (v_size->>'quantity')::INT
    );
  END LOOP;

  RETURN v_product_id;
END;
$$;

GRANT EXECUTE ON FUNCTION create_product_with_sizes(JSONB, JSONB) TO service_role;

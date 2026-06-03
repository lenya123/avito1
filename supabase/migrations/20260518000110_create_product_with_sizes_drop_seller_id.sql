-- ИСПРАВЛЕНИЕ #2: create_product_with_sizes ссылался ещё и на
-- products.seller_id, которой НЕТ (убрана при пивоте на single-tenant).
-- Колонки products по факту (типы БД): name, category, description,
-- purchase_price, drop_price, recommended_price, photo_urls, is_premium,
-- is_active, expected_arrival_date, location_city, purchase_quantity,
-- supplier_id. НЕТ: measurements, seller_id, brand, created_by.
-- Финальное корректное определение. Замеры — ПЕР-РАЗМЕР (§11.6).
-- Сигнатура/return (UUID) не меняются — CREATE OR REPLACE безопасен.

CREATE OR REPLACE FUNCTION create_product_with_sizes(
  p_product JSONB,
  p_sizes JSONB DEFAULT '[]'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_size JSONB;
  v_purchase_qty INT;
BEGIN
  v_purchase_qty := COALESCE((p_product->>'purchase_quantity')::INT, 0);

  INSERT INTO products (
    name,
    category,
    description,
    purchase_price,
    drop_price,
    recommended_price,
    photo_urls,
    is_premium,
    is_active,
    expected_arrival_date,
    location_city,
    supplier_id,
    purchase_quantity
  ) VALUES (
    p_product->>'name',
    p_product->>'category',
    p_product->>'description',
    (p_product->>'purchase_price')::NUMERIC,
    (p_product->>'drop_price')::NUMERIC,
    NULLIF(p_product->>'recommended_price', '')::NUMERIC,
    ARRAY(SELECT jsonb_array_elements_text(p_product->'photo_urls')),
    COALESCE((p_product->>'is_premium')::BOOLEAN, FALSE),
    COALESCE((p_product->>'is_active')::BOOLEAN, TRUE),
    NULLIF(p_product->>'expected_arrival_date', '')::DATE,
    NULLIF(p_product->>'location_city', ''),
    NULLIF(p_product->>'supplier_id', '')::UUID,
    v_purchase_qty
  ) RETURNING id INTO v_product_id;

  IF jsonb_array_length(p_sizes) = 0 THEN
    INSERT INTO product_sizes (
      product_id, size, initial_quantity, current_quantity
    ) VALUES (
      v_product_id, 'One Size', v_purchase_qty, v_purchase_qty
    );
  ELSE
    FOR v_size IN SELECT * FROM jsonb_array_elements(p_sizes) LOOP
      INSERT INTO product_sizes (
        product_id,
        size,
        initial_quantity,
        current_quantity,
        measurements
      ) VALUES (
        v_product_id,
        v_size->>'size',
        (v_size->>'quantity')::INT,
        (v_size->>'quantity')::INT,
        CASE
          WHEN v_size ? 'measurements'
            AND jsonb_typeof(v_size->'measurements') = 'object'
            AND v_size->'measurements' <> '{}'::jsonb
          THEN v_size->'measurements'
          ELSE NULL
        END
      );
    END LOOP;
  END IF;

  RETURN v_product_id;
END;
$$;

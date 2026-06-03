-- ============================================================================
-- Миграция: Фиксы кодовой базы
-- - status_history для таймлайна заказов
-- - Обнуление триггера двойного восстановления количества
-- - RPC для атомарных резерваций
-- - Обновление cancel_order_auto для товаров без размеров
-- ============================================================================

-- 1. Колонка status_history
ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB DEFAULT '[]';

-- 2. Обнулить триггер двойного восстановления количества
-- Триггер update_product_quantity_on_order вызывает +1 current_quantity при cancel/return_completed,
-- но API код тоже вызывает increment_product_size_quantity RPC → двойное восстановление.
-- Оставляем API код как единственный источник управления количеством.
CREATE OR REPLACE FUNCTION update_product_quantity_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- No-op: количество теперь управляется только через API/RPC
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Атомарный инкремент reserved_quantity (для размеров И товаров без размеров)
CREATE OR REPLACE FUNCTION increment_reserved_quantity(
  target_size_id UUID DEFAULT NULL,
  target_product_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_size_id IS NOT NULL THEN
    UPDATE product_sizes
    SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1,
        updated_at = NOW()
    WHERE id = target_size_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product size % not found', target_size_id;
    END IF;
  ELSIF target_product_id IS NOT NULL THEN
    UPDATE products
    SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1,
        updated_at = NOW()
    WHERE id = target_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', target_product_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Either target_size_id or target_product_id must be provided';
  END IF;
END;
$$;

-- 4. Атомарный декремент reserved_quantity (безопасный, не ниже 0)
CREATE OR REPLACE FUNCTION decrement_reserved_quantity_safe(
  target_size_id UUID DEFAULT NULL,
  target_product_id UUID DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF target_size_id IS NOT NULL THEN
    UPDATE product_sizes
    SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0),
        updated_at = NOW()
    WHERE id = target_size_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product size % not found', target_size_id;
    END IF;
  ELSIF target_product_id IS NOT NULL THEN
    UPDATE products
    SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0),
        updated_at = NOW()
    WHERE id = target_product_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product % not found', target_product_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Either target_size_id or target_product_id must be provided';
  END IF;
END;
$$;

-- 5. Обновить cancel_order_auto — поддержка товаров без размеров + status_history
CREATE OR REPLACE FUNCTION cancel_order_auto(
  order_id UUID,
  reason TEXT DEFAULT 'auto_expired'
)
RETURNS TABLE (
  success BOOLEAN,
  refunded_amount DECIMAL(10, 2),
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_refund DECIMAL(10, 2) := 0;
  v_history JSONB;
BEGIN
  -- 1. Получаем и блокируем заказ
  SELECT o.id, o.status, o.client_id, o.client_price, o.is_paid,
         o.product_size_id, o.product_id, o.status_history
  INTO v_order
  FROM orders o
  WHERE o.id = order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL(10,2), 'Order not found'::TEXT;
    RETURN;
  END IF;

  -- 2. Проверяем статус
  IF v_order.status NOT IN ('awaiting_shipment', 'collecting', 'problem') THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL(10,2),
      format('Order is in status %s, cannot cancel', v_order.status)::TEXT;
    RETURN;
  END IF;

  -- 3. Обновляем status_history
  v_history := COALESCE(v_order.status_history, '[]'::JSONB);
  v_history := v_history || jsonb_build_object('status', 'cancelled', 'timestamp', NOW()::TEXT);

  -- 4. Обновляем статус заказа
  UPDATE orders
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancel_reason = reason,
      status_history = v_history,
      updated_at = NOW()
  WHERE id = order_id;

  -- 5. Возвращаем количество товара (размер ИЛИ товар)
  IF v_order.product_size_id IS NOT NULL THEN
    UPDATE product_sizes
    SET current_quantity = current_quantity + 1,
        updated_at = NOW()
    WHERE id = v_order.product_size_id;
  ELSIF v_order.product_id IS NOT NULL THEN
    UPDATE products
    SET current_quantity = COALESCE(current_quantity, 0) + 1,
        updated_at = NOW()
    WHERE id = v_order.product_id
      AND current_quantity IS NOT NULL;
  END IF;

  -- 6. Возвращаем средства если оплачено
  IF v_order.is_paid AND v_order.client_price > 0 THEN
    UPDATE users
    SET deposit = deposit + v_order.client_price,
        updated_at = NOW()
    WHERE id = v_order.client_id;

    v_refund := v_order.client_price;
  END IF;

  RETURN QUERY SELECT TRUE, v_refund, NULL::TEXT;
END;
$$;

-- 6. Гранты
GRANT EXECUTE ON FUNCTION increment_reserved_quantity(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_reserved_quantity_safe(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_order_auto(UUID, TEXT) TO service_role;

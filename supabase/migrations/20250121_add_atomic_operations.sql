-- Атомарные RPC функции для BullMQ обработчиков
-- Обеспечивают целостность данных без явных транзакций

-- ============================================================================
-- Функция для увеличения количества товара (при отмене заказа)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_product_size_quantity(
  size_id UUID,
  amount INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE product_sizes
  SET current_quantity = current_quantity + amount,
      updated_at = NOW()
  WHERE id = size_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product size % not found', size_id;
  END IF;
END;
$$;

-- ============================================================================
-- Функция для увеличения депозита пользователя (возврат средств)
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_user_deposit(
  user_id UUID,
  amount DECIMAL(10, 2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET deposit = deposit + amount,
      updated_at = NOW()
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', user_id;
  END IF;
END;
$$;

-- ============================================================================
-- Функция для уменьшения депозита пользователя (штраф)
-- ============================================================================
CREATE OR REPLACE FUNCTION decrement_user_deposit(
  user_id UUID,
  amount DECIMAL(10, 2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET deposit = deposit - amount,
      updated_at = NOW()
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', user_id;
  END IF;
END;
$$;

-- ============================================================================
-- Функция для увеличения реферального депозита
-- ============================================================================
CREATE OR REPLACE FUNCTION increment_referral_deposit(
  user_id UUID,
  amount DECIMAL(10, 2)
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE users
  SET referral_deposit = referral_deposit + amount,
      updated_at = NOW()
  WHERE id = user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', user_id;
  END IF;
END;
$$;

-- ============================================================================
-- Функция для уменьшения reserved_quantity
-- ============================================================================
CREATE OR REPLACE FUNCTION decrement_reserved_quantity(
  size_id UUID,
  amount INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE product_sizes
  SET reserved_quantity = GREATEST(0, reserved_quantity - amount),
      updated_at = NOW()
  WHERE id = size_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Product size % not found', size_id;
  END IF;
END;
$$;

-- ============================================================================
-- Комплексная функция отмены заказа (атомарная транзакция)
-- Используется для автоотмены по дедлайну
-- ============================================================================
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
BEGIN
  -- 1. Получаем и блокируем заказ
  SELECT o.id, o.status, o.client_id, o.client_price, o.is_paid, o.product_size_id
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

  -- 3. Обновляем статус заказа
  UPDATE orders
  SET status = 'cancelled',
      cancelled_at = NOW(),
      cancel_reason = reason,
      updated_at = NOW()
  WHERE id = order_id;

  -- 4. Возвращаем количество товара
  UPDATE product_sizes
  SET current_quantity = current_quantity + 1,
      updated_at = NOW()
  WHERE id = v_order.product_size_id;

  -- 5. Возвращаем средства если оплачено
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

-- ============================================================================
-- Комплексная функция перевода в trash
-- ============================================================================
CREATE OR REPLACE FUNCTION move_order_to_trash(
  order_id UUID
)
RETURNS TABLE (
  success BOOLEAN,
  penalty_applied DECIMAL(10, 2),
  error_message TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_order RECORD;
  v_user RECORD;
  v_penalty DECIMAL(10, 2) := 0;
  v_trash_deadline TIMESTAMP;
BEGIN
  -- 1. Получаем заказ
  SELECT o.id, o.status, o.client_id, o.client_price
  INTO v_order
  FROM orders o
  WHERE o.id = order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL(10,2), 'Order not found'::TEXT;
    RETURN;
  END IF;

  -- 2. Проверяем статус
  IF v_order.status != 'return_arrived' THEN
    RETURN QUERY SELECT FALSE, 0::DECIMAL(10,2),
      format('Order is in status %s, expected return_arrived', v_order.status)::TEXT;
    RETURN;
  END IF;

  -- 3. Рассчитываем дедлайн
  v_trash_deadline := NOW() + INTERVAL '30 days';

  -- 4. Обновляем статус
  UPDATE orders
  SET status = 'trash',
      trash_at = NOW(),
      trash_deadline = v_trash_deadline,
      updated_at = NOW()
  WHERE id = order_id;

  -- 5. Проверяем +ВАЙБ и применяем штраф
  SELECT u.id, u.is_vibe_plus
  INTO v_user
  FROM users u
  WHERE u.id = v_order.client_id;

  IF v_user.is_vibe_plus THEN
    UPDATE users
    SET deposit = deposit - v_order.client_price,
        updated_at = NOW()
    WHERE id = v_order.client_id;

    v_penalty := v_order.client_price;
  END IF;

  RETURN QUERY SELECT TRUE, v_penalty, NULL::TEXT;
END;
$$;

-- ============================================================================
-- Грант прав на выполнение (для service role)
-- ============================================================================
GRANT EXECUTE ON FUNCTION increment_product_size_quantity(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION increment_user_deposit(UUID, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_user_deposit(UUID, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION increment_referral_deposit(UUID, DECIMAL) TO service_role;
GRANT EXECUTE ON FUNCTION decrement_reserved_quantity(UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION cancel_order_auto(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION move_order_to_trash(UUID) TO service_role;

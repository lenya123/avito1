-- ============================================================================
-- ТЗ Авито-заказы §4.2 п.5: атомарное подтверждение размера + резерв стока.
--
-- Вызывается из avito-process-awaiting-size handler'а после успешного
-- парсинга ответа покупателя:
--
--   • Проверяет, что product_sizes.current_quantity > 0 (между запросом и
--     ответом параллельный дроп-заказ мог выкупить последнюю единицу).
--   • Декрементит current_quantity (резерв).
--   • Ставит orders.product_size_id, size, status='paid', paid_at, is_paid.
--   • Возвращает {ok: true} при успехе или {ok: false, reason: 'out_of_stock'}.
--
-- Идемпотентность: повторный вызов с уже paid-заказом возвращает {ok:true}
-- без декремента (защита от двойного резерва).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.avito_confirm_size_and_reserve(
  p_order_id        UUID,
  p_product_size_id UUID,
  p_size            VARCHAR(10)
) RETURNS JSONB AS $$
DECLARE
  v_current_qty INT;
  v_current_status TEXT;
BEGIN
  -- Идемпотентность: если заказ уже paid с этим размером — no-op.
  SELECT status INTO v_current_status FROM public.orders WHERE id = p_order_id;
  IF v_current_status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true);
  END IF;
  IF v_current_status != 'awaiting_size' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_status', 'status', v_current_status);
  END IF;

  -- Лок строки размера и проверка остатка.
  SELECT current_quantity INTO v_current_qty
  FROM public.product_sizes
  WHERE id = p_product_size_id
  FOR UPDATE;

  IF v_current_qty IS NULL OR v_current_qty <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'out_of_stock');
  END IF;

  -- Декремент стока.
  UPDATE public.product_sizes
  SET current_quantity = current_quantity - 1
  WHERE id = p_product_size_id;

  -- Перевод заказа.
  UPDATE public.orders
  SET product_size_id = p_product_size_id,
      size            = p_size,
      status          = 'paid',
      is_paid         = TRUE,
      paid_at         = COALESCE(paid_at, NOW()),
      updated_at      = NOW()
  WHERE id = p_order_id;

  RETURN jsonb_build_object('ok', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.avito_confirm_size_and_reserve(UUID, UUID, VARCHAR) TO authenticated, service_role;

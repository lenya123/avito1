-- Исправление триггера: убираем обработку INSERT
-- current_quantity теперь уменьшается в API при создании заказа

-- Обновляем функцию
CREATE OR REPLACE FUNCTION update_product_quantity_on_order()
RETURNS TRIGGER AS $$
BEGIN
  -- НЕ обрабатываем INSERT - это делается в API при создании заказа
  -- Триггер только для UPDATE статуса
  IF TG_OP = 'UPDATE' THEN
    -- При отмене заказа до отправки - возвращаем товар в наличие
    IF OLD.status IN ('pending_payment', 'awaiting_shipment', 'collecting')
       AND NEW.status = 'cancelled' THEN
      UPDATE product_sizes
      SET current_quantity = current_quantity + 1
      WHERE id = NEW.product_size_id;
    -- При возврате - возвращаем товар
    ELSIF NEW.status = 'return_completed' AND OLD.status != 'return_completed' THEN
      UPDATE product_sizes
      SET current_quantity = current_quantity + 1
      WHERE id = NEW.product_size_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Пересоздаём триггер только на UPDATE (без INSERT)
DROP TRIGGER IF EXISTS trigger_update_quantity ON orders;
CREATE TRIGGER trigger_update_quantity
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION update_product_quantity_on_order();

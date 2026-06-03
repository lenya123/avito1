-- =====================================================
-- Миграция 2: Триггеры и функции
-- =====================================================

-- Автоматическое обновление updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER orders_updated_at BEFORE UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settings_updated_at BEFORE UPDATE ON settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Уведомление при поступлении товара
CREATE OR REPLACE FUNCTION notify_product_arrival()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.is_in_stock = FALSE AND NEW.is_in_stock = TRUE THEN
    UPDATE product_notifications
    SET notified = TRUE, notified_at = NOW()
    WHERE product_id = NEW.id AND notified = FALSE;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_product_arrival
  AFTER UPDATE OF is_in_stock ON products
  FOR EACH ROW EXECUTE FUNCTION notify_product_arrival();

-- Автоматический расчёт уровня пользователя
CREATE OR REPLACE FUNCTION calculate_user_level()
RETURNS TRIGGER AS $$
BEGIN
  -- Обновляем уровень на основе количества заказов
  IF NEW.total_completed_orders >= 50 THEN
    NEW.level = 3;
    NEW.discount_percent = 10;
  ELSIF NEW.total_completed_orders >= 30 THEN
    NEW.level = 2;
    NEW.discount_percent = 6;
  ELSIF NEW.total_completed_orders >= 15 THEN
    NEW.level = 1;
    NEW.discount_percent = 3;
  ELSE
    NEW.level = 0;
    NEW.discount_percent = 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_calculate_level
  BEFORE UPDATE OF total_completed_orders ON users
  FOR EACH ROW EXECUTE FUNCTION calculate_user_level();

-- Автоматическое обновление количества товара при изменении статуса заказа
-- ВАЖНО: current_quantity уменьшается в API при создании заказа, а НЕ в триггере!
-- Триггер только обрабатывает изменения статуса (отмена, возврат)
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

-- Триггер только на UPDATE, НЕ на INSERT!
DROP TRIGGER IF EXISTS trigger_update_quantity ON orders;
CREATE TRIGGER trigger_update_quantity
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION update_product_quantity_on_order();

-- Обновление счётчика заказов пользователя
CREATE OR REPLACE FUNCTION update_user_order_count()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status != 'completed' THEN
    UPDATE users
    SET total_completed_orders = total_completed_orders + 1
    WHERE id = NEW.client_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_order_count
  AFTER UPDATE OF status ON orders
  FOR EACH ROW EXECUTE FUNCTION update_user_order_count();

-- Генерация реферального кода
CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.referral_code IS NULL AND NEW.role = 'client' THEN
    NEW.referral_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 8));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_referral_code
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION generate_referral_code();

-- Генерация site_key для клиентов
CREATE OR REPLACE FUNCTION generate_site_key()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.site_key IS NULL AND NEW.role = 'client' THEN
    NEW.site_key = ENCODE(GEN_RANDOM_BYTES(32), 'hex');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_generate_site_key
  BEFORE INSERT ON users
  FOR EACH ROW EXECUTE FUNCTION generate_site_key();

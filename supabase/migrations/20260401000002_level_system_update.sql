-- Обновление системы уровней:
-- Пороги: 300/600/900 заказов (было 15/30/50)
-- Скидки: 15/30/50% на подписку (было 3/6/10% на заказы)

CREATE OR REPLACE FUNCTION calculate_user_level()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.total_completed_orders >= 900 THEN
    NEW.level = 3;
    NEW.discount_percent = 50;
  ELSIF NEW.total_completed_orders >= 600 THEN
    NEW.level = 2;
    NEW.discount_percent = 30;
  ELSIF NEW.total_completed_orders >= 300 THEN
    NEW.level = 1;
    NEW.discount_percent = 15;
  ELSE
    NEW.level = 0;
    NEW.discount_percent = 0;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Пересчитать уровни всех существующих пользователей
UPDATE users SET
  level = CASE
    WHEN total_completed_orders >= 900 THEN 3
    WHEN total_completed_orders >= 600 THEN 2
    WHEN total_completed_orders >= 300 THEN 1
    ELSE 0
  END,
  discount_percent = CASE
    WHEN total_completed_orders >= 900 THEN 50
    WHEN total_completed_orders >= 600 THEN 30
    WHEN total_completed_orders >= 300 THEN 15
    ELSE 0
  END;

-- Запрет на NULL в orders.pickup_by — гарантия, что возврат не зависнет
-- без дедлайна забора (sweep не находит NULL через `< today` сравнение).
-- Симметрично send_by, который стал NOT NULL миграцией 20260526000020.
ALTER TABLE orders ALTER COLUMN pickup_by SET NOT NULL;

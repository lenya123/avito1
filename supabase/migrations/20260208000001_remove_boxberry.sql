-- Удаление Boxberry из поддерживаемых служб доставки
-- Boxberry закрылся (поглощён Яндексом)

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_service_check;
ALTER TABLE orders ADD CONSTRAINT orders_delivery_service_check
  CHECK (delivery_service IN ('avito', 'yandex', 'cdek', 'pochta', '5post'));

-- Также обновить pickup_points если есть записи Boxberry
DELETE FROM pickup_points WHERE delivery_service = 'boxberry';

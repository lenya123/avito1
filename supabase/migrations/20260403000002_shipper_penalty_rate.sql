-- Штраф за пропуск рабочего дня (когда были заказы, но отправщик не отправил)
ALTER TABLE settings
  ADD COLUMN IF NOT EXISTS shipper_penalty_rate DECIMAL(10,2) DEFAULT 0;

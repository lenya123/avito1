-- Backfill orders.send_by для исторических записей с NULL.
-- Проставляем (created_at + 7 дней) :: date — это дефолтный максимум
-- send_by_max_days, как если бы клиент при оформлении выбрал самый
-- дальний срок. Готовит почву под NOT NULL constraint следующей миграцией.
UPDATE orders
SET send_by = ((created_at AT TIME ZONE 'Europe/Moscow') + INTERVAL '7 days')::date
WHERE send_by IS NULL;

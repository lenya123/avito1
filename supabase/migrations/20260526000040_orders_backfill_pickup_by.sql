-- Backfill orders.pickup_by для исторических записей с NULL.
-- Проставляем (created_at + 7 дней) :: date — это дефолтный максимум
-- pickup_by_max_days, как если бы клиент при оформлении возврата выбрал
-- самый дальний срок. Готовит почву под NOT NULL constraint следующей
-- миграцией. Финальные статусы (sent, cancelled, return_done) тоже
-- получают значение — это косметика истории, на UX не влияет.
UPDATE orders
SET pickup_by = ((created_at AT TIME ZONE 'Europe/Moscow') + INTERVAL '7 days')::date
WHERE pickup_by IS NULL;

-- Добавляем поле для запланированной смены тарифа (даунгрейд)
-- Дата активации = subscription_end текущей подписки
ALTER TABLE users
  ADD COLUMN scheduled_subscription_tier TEXT DEFAULT NULL
    CHECK (scheduled_subscription_tier IS NULL OR scheduled_subscription_tier IN ('basic', 'premium', 'top_floor_boss'));

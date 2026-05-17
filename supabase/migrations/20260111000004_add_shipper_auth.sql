-- =====================================================
-- Миграция 4: Добавление авторизации для отправщиков
-- =====================================================

-- Добавляем поля для авторизации отправщиков
ALTER TABLE users
ADD COLUMN IF NOT EXISTS shipper_login VARCHAR(100) UNIQUE,
ADD COLUMN IF NOT EXISTS shipper_password_hash VARCHAR(255);

-- Индекс для быстрого поиска по логину
CREATE INDEX IF NOT EXISTS idx_users_shipper_login ON users(shipper_login)
  WHERE role = 'shipper';

-- Комментарии
COMMENT ON COLUMN users.shipper_login IS 'Логин отправщика для авторизации в PWA';
COMMENT ON COLUMN users.shipper_password_hash IS 'Bcrypt хеш пароля отправщика';

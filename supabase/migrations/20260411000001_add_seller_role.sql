-- Расширяем роль пользователя: добавляем "seller"
-- Если есть CHECK constraint на role — обновляем его
DO $$
BEGIN
  -- Пробуем удалить существующий constraint (может не существовать)
  BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
END $$;

-- Добавляем обновлённый constraint с seller
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'shipper', 'client', 'seller'));

-- Индекс для быстрого поиска селлеров
CREATE INDEX IF NOT EXISTS idx_users_sellers ON users(id) WHERE role = 'seller';

-- Индекс для изоляции данных по created_by (товары селлера)
CREATE INDEX IF NOT EXISTS idx_products_created_by ON products(created_by);

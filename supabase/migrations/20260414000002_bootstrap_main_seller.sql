-- ============================================================================
-- Multi-seller phase A.3: bootstrap main-seller + linked_owner_id
-- ============================================================================
-- Создаёт техническую запись users (role='seller', linked_owner_id=<owner.id>)
-- для владельца платформы. Все существующие товары/заказы, принадлежащие owner
-- или с NULL seller_id, перепривязываются к этой записи.
-- После миграции владелец продолжает работать через /owner/*, но данные
-- атрибутируются main-seller для корректной RLS и аналитики.

-- 1. Добавляем linked_owner_id для связи main-seller ↔ owner
ALTER TABLE users ADD COLUMN IF NOT EXISTS linked_owner_id UUID REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_users_linked_owner ON users(linked_owner_id) WHERE linked_owner_id IS NOT NULL;

-- 2. Создаём main-seller для каждого существующего owner (обычно один)
DO $$
DECLARE
  v_owner RECORD;
  v_main_seller_id UUID;
  v_site_key TEXT;
BEGIN
  FOR v_owner IN SELECT id, telegram_id, name FROM users WHERE role = 'owner' LOOP
    -- Проверяем, не создан ли уже main-seller для этого owner
    SELECT id INTO v_main_seller_id
    FROM users
    WHERE role = 'seller' AND linked_owner_id = v_owner.id
    LIMIT 1;

    IF v_main_seller_id IS NULL THEN
      -- Генерируем site_key (64 hex) через pgcrypto
      v_site_key := encode(extensions.gen_random_bytes(32), 'hex');

      -- telegram_id должен быть UNIQUE NOT NULL — используем отрицательный
      -- (placeholder, не реальный telegram), чтобы не конфликтовать с owner
      INSERT INTO users (
        role,
        telegram_id,
        name,
        site_key,
        linked_owner_id,
        shop_name,
        is_onboarding_completed
      ) VALUES (
        'seller',
        -ABS(v_owner.telegram_id), -- отрицательный placeholder
        COALESCE(v_owner.name, 'Главный магазин'),
        v_site_key,
        v_owner.id,
        'Главный магазин',
        TRUE
      ) RETURNING id INTO v_main_seller_id;

      -- Перепривязываем все товары owner к main-seller
      UPDATE products
      SET seller_id = v_main_seller_id,
          created_by = v_main_seller_id
      WHERE seller_id IS NULL OR seller_id = v_owner.id;

      RAISE NOTICE 'Created main-seller % for owner %', v_main_seller_id, v_owner.id;
    END IF;
  END LOOP;
END $$;

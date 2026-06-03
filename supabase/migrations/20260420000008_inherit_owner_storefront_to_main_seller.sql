-- ============================================================================
-- Multi-seller follow-up: перенос витринных полей owner → main-seller
-- ============================================================================
-- Bootstrap-миграция 20260414000002 создавала main-seller с дефолтным
-- shop_name='Главный магазин', не наследуя owner.shop_name/bio/avatar_url.
-- Это приводило к расхождению: клиент видит "Главный магазин", а владелец
-- ожидает увидеть имя, которое он задал до мульти-селлера.
--
-- Эта миграция:
-- 1) Переносит owner.{shop_name,bio,avatar_url} → main-seller,
--    если у main-seller поле пустое или равно bootstrap-дефолту.
-- 2) Создаёт недостающих main-seller для любых будущих owner, наследуя
--    витринные поля (идемпотентная вставка).
--
-- Owner.shop_name после миграции остаётся "легаси"-полем: UI его не читает
-- и не пишет. Источник правды — main-seller (linked_owner_id = owner.id).

-- 1) Перенос существующих значений.
UPDATE users AS seller
SET
  shop_name  = COALESCE(NULLIF(owner.shop_name, ''), seller.shop_name),
  bio        = COALESCE(seller.bio, owner.bio),
  avatar_url = COALESCE(seller.avatar_url, owner.avatar_url)
FROM users AS owner
WHERE seller.role = 'seller'
  AND seller.linked_owner_id = owner.id
  AND owner.role = 'owner'
  AND (
    -- shop_name перезаписываем только если у seller дефолт или пусто
    (
      owner.shop_name IS NOT NULL AND owner.shop_name <> ''
      AND (seller.shop_name IS NULL OR seller.shop_name = '' OR seller.shop_name = 'Главный магазин')
    )
    -- bio/avatar — только если у seller пусто, а у owner есть значение
    OR (seller.bio IS NULL AND owner.bio IS NOT NULL)
    OR (seller.avatar_url IS NULL AND owner.avatar_url IS NOT NULL)
  );

-- 2) Догоняющий bootstrap для owner без main-seller (на случай ручных правок БД
--    или будущих owner-регистраций до появления триггера).
DO $$
DECLARE
  v_owner RECORD;
  v_site_key TEXT;
BEGIN
  FOR v_owner IN
    SELECT o.id, o.telegram_id, o.name, o.shop_name, o.bio, o.avatar_url
    FROM users o
    WHERE o.role = 'owner'
      AND NOT EXISTS (
        SELECT 1 FROM users s
        WHERE s.role = 'seller' AND s.linked_owner_id = o.id
      )
  LOOP
    v_site_key := encode(extensions.gen_random_bytes(32), 'hex');

    INSERT INTO users (
      role, telegram_id, name, site_key, linked_owner_id,
      shop_name, bio, avatar_url, is_onboarding_completed
    ) VALUES (
      'seller',
      -ABS(v_owner.telegram_id),
      COALESCE(v_owner.name, 'Главный магазин'),
      v_site_key,
      v_owner.id,
      COALESCE(NULLIF(v_owner.shop_name, ''), 'Главный магазин'),
      v_owner.bio,
      v_owner.avatar_url,
      TRUE
    );

    RAISE NOTICE 'Bootstrapped main-seller for owner % (inherited storefront fields)', v_owner.id;
  END LOOP;
END $$;

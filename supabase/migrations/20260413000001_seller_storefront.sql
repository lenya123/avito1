-- Витрина селлера: описание и название магазина
-- avatar_url уже добавлен в 20260205000002_add_avatar.sql
-- bio — описание селлера для публичной витрины (до 500 символов)
-- shop_name — публичное название магазина (если null, fallback на name)

ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS shop_name TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_bio_length'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_bio_length
      CHECK (bio IS NULL OR char_length(bio) <= 500);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'users_shop_name_length'
  ) THEN
    ALTER TABLE users ADD CONSTRAINT users_shop_name_length
      CHECK (shop_name IS NULL OR char_length(shop_name) BETWEEN 2 AND 60);
  END IF;
END $$;

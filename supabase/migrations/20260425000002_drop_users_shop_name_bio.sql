-- Stage 2.1 — Дроп users.shop_name / users.bio.
--
-- Данные уже переехали в business_settings (мигр. 20260425000001).
-- Код (api/owner/profile, api/owner/settings) обновлён до применения этой
-- миграции, чтобы никакие запросы не сломались.
--
-- CASCADE для снятия CHECK-ограничений users_shop_name_length / users_bio_length.

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_shop_name_length,
  DROP CONSTRAINT IF EXISTS users_bio_length;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS shop_name CASCADE,
  DROP COLUMN IF EXISTS bio CASCADE;

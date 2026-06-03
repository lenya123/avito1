-- Удаляем бесполезные лимиты заказов по уровням (нигде не используются в бизнес-логике)
ALTER TABLE public.settings
  DROP COLUMN IF EXISTS max_orders_per_day_level_0,
  DROP COLUMN IF EXISTS max_orders_per_day_level_1,
  DROP COLUMN IF EXISTS max_orders_per_day_level_2,
  DROP COLUMN IF EXISTS max_orders_per_day_level_3;

-- Фикс: дефолт резервации 15 → 10 (соответствует реальному захардкоженному значению в reservations/route.ts)
UPDATE public.settings SET reservation_timeout_minutes = 10 WHERE reservation_timeout_minutes = 15;

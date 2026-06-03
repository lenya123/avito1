-- Этап 1 пивота на B2B SaaS: зачистка устаревших триггеров.
--
-- В миграциях stage1_drop_legacy_columns DROP COLUMN CASCADE удалил зависимые
-- объекты, но только те, где зависимость от колонки была явно записана в
-- каталоге (SQL-функции, views). Функции plpgsql ссылки на колонки не
-- регистрируют — триггеры на их основе остались и падают на INSERT/UPDATE.
--
-- Удаляем их вручную.
--
-- 1. trigger_generate_referral_code — ссылается на users.referral_code (DROP).
-- 2. trigger_update_order_count — обновляет users.total_completed_orders (DROP).
--
-- Эти поведения больше не нужны после пивота (рефералы/уровни удалены).

DROP TRIGGER IF EXISTS trigger_generate_referral_code ON public.users;
DROP FUNCTION IF EXISTS public.generate_referral_code();

DROP TRIGGER IF EXISTS trigger_update_order_count ON public.orders;
DROP FUNCTION IF EXISTS public.update_user_order_count();

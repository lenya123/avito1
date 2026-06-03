-- Функцию триггера тоже сносим — её больше никто не вызывает после миграции
-- 20260526000050 (DROP TRIGGER). Чисто за собой.
DROP FUNCTION IF EXISTS public.write_partner_debt_on_vibe_payment();

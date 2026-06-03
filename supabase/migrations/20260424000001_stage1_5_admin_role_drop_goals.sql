-- Этап 1.5 — досборка пивота.
--
-- 1) В CHECK-ограничении на users.role добавляем 'admin' — вендорскую роль,
--    которая уже используется в is_admin()/is_owner()/is_shipper() хелперах,
--    но CHECK её не допускал. 'client'/'seller' оставлены в CHECK, чтобы не
--    ломать исторические строки (их окончательно уберёт Stage 2, когда
--    клиенты переедут в новую таблицу customers и orders.client_id
--    заменится на FK).
--
-- 2) Удаляем users.goals — колонка от селлерских "месячных целей" (мигр.
--    20260421000002), в новой модели не используется.
--
-- Детали: ~/.claude/plans/valiant-hatching-lollipop.md

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'shipper', 'admin', 'client', 'seller'));

ALTER TABLE public.users DROP COLUMN IF EXISTS goals;

-- 3) Остатки реферальной программы в settings: миграция 20260423000003
--    дропнула settings.referral_percent и platform_commission_pct, но
--    referral_first_order_bonus, referral_percent_cap, referral_period_days
--    не были упомянуты и остались. Удаляем их тут — реферальная программа
--    в новой модели не предусмотрена.

ALTER TABLE public.settings
  DROP COLUMN IF EXISTS referral_first_order_bonus,
  DROP COLUMN IF EXISTS referral_percent_cap,
  DROP COLUMN IF EXISTS referral_period_days;

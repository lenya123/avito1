-- Phase D quick-add: общий аккаунт для общения клиентов с отправщиками.
--
-- BUSINESS_LOGIC §6.5/§6.6: при «плохом качестве» / спорных попытках забора
-- клиенту в DM приходит ссылка «написать менеджеру». На этом аккаунте сидят
-- все отправщики (общий staff-account, не персональный отправщика).
--
-- Хранится одной строкой в business_settings (single-tenant).

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS support_telegram_username TEXT;

COMMENT ON COLUMN public.business_settings.support_telegram_username IS
  'Telegram-username (без @) общего аккаунта отправщиков для связи с клиентами при спорных возвратах. Owner редактирует в /owner/settings. Используется в DM-уведомлениях с deep-link t.me/<username>.';

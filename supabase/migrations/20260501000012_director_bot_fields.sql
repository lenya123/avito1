-- Поля для привязки директора (отдельная роль от владельца).
-- Director-bot получает чеки на проверку — текстовое «N да/нет».
-- Привязка через `/start <invite_token>` — invite_token генерится в panel.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS director_invite_token UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS director_tg_user_id BIGINT,
  ADD COLUMN IF NOT EXISTS director_tg_username TEXT,
  ADD COLUMN IF NOT EXISTS director_linked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.business_settings.director_invite_token IS
  'Токен для привязки директора через director-bot /start <token>. Регенерируется по кнопке в panel.';
COMMENT ON COLUMN public.business_settings.director_tg_user_id IS
  'Telegram ID директора после успешного /start. Используется для DM-уведомлений (чек на проверку).';

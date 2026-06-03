-- Phase A.6 — Расширение business_settings под новые механики.
--
-- BUSINESS_LOGIC.md:
--  §4.5 — send_by_today_cutoff (TIME, дефолт 16:00 МСК)
--           если сейчас раньше — клиент может выбрать «сегодня», иначе минимум «завтра».
--         send_by_max_days (INT, дефолт 7) — потолок календаря «отгрузить до».
--  §4.5 — pickup_by_max_days (INT, дефолт 14) — потолок календаря «забрать возврат до».
--  §7.4 — vibe_manual_threshold (NUMERIC, дефолт 50000) —
--         сумма погашения +ВАЙБ-долга, выше которой чек уходит на ручное подтверждение владельцу.
--
-- vibe_receipt_confirm_threshold из 20260425000001 переименовываем в vibe_manual_threshold:
-- старое имя касалось «обычной оплаты заказа», в новой модели обычная оплата всегда
-- через Vision auto-confirm (без ручного порога). Новый порог — только для +ВАЙБ-погашений.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS send_by_today_cutoff TIME NOT NULL DEFAULT '16:00:00',
  ADD COLUMN IF NOT EXISTS send_by_max_days INT NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS pickup_by_max_days INT NOT NULL DEFAULT 14,
  ADD COLUMN IF NOT EXISTS vibe_manual_threshold NUMERIC(12, 2) NOT NULL DEFAULT 50000;

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_send_by_max_days_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_send_by_max_days_check
  CHECK (send_by_max_days BETWEEN 1 AND 30);

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_pickup_by_max_days_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_pickup_by_max_days_check
  CHECK (pickup_by_max_days BETWEEN 1 AND 60);

ALTER TABLE public.business_settings
  DROP CONSTRAINT IF EXISTS business_settings_vibe_manual_threshold_check;
ALTER TABLE public.business_settings
  ADD CONSTRAINT business_settings_vibe_manual_threshold_check
  CHECK (vibe_manual_threshold >= 0);

-- Перенос значения из старого vibe_receipt_confirm_threshold (если был установлен).
UPDATE public.business_settings
SET vibe_manual_threshold = vibe_receipt_confirm_threshold
WHERE vibe_receipt_confirm_threshold IS NOT NULL
  AND vibe_manual_threshold = 50000;

COMMENT ON COLUMN public.business_settings.send_by_today_cutoff IS
  'BUSINESS_LOGIC §4.5: до этого времени МСК клиент в wizard-е может выбрать «сегодня»; после — минимум «завтра». Дефолт 16:00.';
COMMENT ON COLUMN public.business_settings.send_by_max_days IS
  'BUSINESS_LOGIC §4.5: максимум дней вперёд для inline-календаря send_by. Дефолт 7.';
COMMENT ON COLUMN public.business_settings.pickup_by_max_days IS
  'BUSINESS_LOGIC §4.5: максимум дней вперёд для inline-календаря pickup_by при оформлении возврата. Дефолт 14.';
COMMENT ON COLUMN public.business_settings.vibe_manual_threshold IS
  'BUSINESS_LOGIC §7.4: порог суммы +ВАЙБ-погашения, свыше которого чек уходит владельцу на ручное подтверждение. Дефолт 50000 ₽.';

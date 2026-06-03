-- Отдельное рабочее окно для директорских digest'ов (раньше использовали
-- общее `partner_notify_window_*`). Дефолт тот же — 10:00–22:00 МСК.

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS director_notify_window_start TIME NOT NULL DEFAULT '10:00:00',
  ADD COLUMN IF NOT EXISTS director_notify_window_end TIME NOT NULL DEFAULT '22:00:00';

COMMENT ON COLUMN public.business_settings.director_notify_window_start IS
  'Начало окна когда директорский digest-job шлёт сводку (по МСК). По дефолту 10:00.';
COMMENT ON COLUMN public.business_settings.director_notify_window_end IS
  'Конец окна когда директорский digest-job шлёт сводку (по МСК). По дефолту 22:00.';

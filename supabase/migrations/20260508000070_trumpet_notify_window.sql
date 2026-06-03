-- Окно отправки trumpet-напоминаний клиентам (DM «обнови код возврата»).
-- Используется обоими сценариями: и shipper'ом владельца, и партнёром.
-- Это всегда взаимодействие с клиентом, поэтому одно настраиваемое окно
-- на оба вида trumpet'а.
ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS trumpet_notify_window_start TIME NOT NULL DEFAULT '10:00:00',
  ADD COLUMN IF NOT EXISTS trumpet_notify_window_end TIME NOT NULL DEFAULT '21:00:00';

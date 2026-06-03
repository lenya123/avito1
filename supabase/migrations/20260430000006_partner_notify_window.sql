-- Окно работы партнёра — диапазон, в течение которого бот шлёт партнёру
-- уведомления и напоминания (форварды чеков, напоминания про
-- неподтверждённую оплату). Цель — не дёргать партнёра ночью.
--
-- Настраивается владельцем в `/owner/settings`. Дефолт 10:00–22:00 МСК.
-- Auto-cancel заказа при превышении 24ч молчания партнёра — без учёта
-- окна (это эскалация, не уведомление).

ALTER TABLE business_settings
  ADD COLUMN partner_notify_window_start TIME NOT NULL DEFAULT '10:00:00',
  ADD COLUMN partner_notify_window_end TIME NOT NULL DEFAULT '22:00:00';

COMMENT ON COLUMN business_settings.partner_notify_window_start IS
  'Начало рабочего окна партнёров (МСК). Раньше — уведомления откладываются.';
COMMENT ON COLUMN business_settings.partner_notify_window_end IS
  'Конец рабочего окна партнёров (МСК). Позже — уведомления откладываются на начало следующего окна.';

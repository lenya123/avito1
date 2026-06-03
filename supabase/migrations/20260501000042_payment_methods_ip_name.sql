-- Этап 4: поле ip_name в payment_methods (для kind=ip_qr).
-- Используется в multi-signal проверке Vision: имя ИП из чека сравнивается
-- с этим полем. Заполняется владельцем точно как в банковском чеке клиенту
-- (например: «ИП СОЛОВЬЕВ ЯРОСЛАВ АЛЕКСЕЕВИЧ»).

ALTER TABLE public.payment_methods
  ADD COLUMN IF NOT EXISTS ip_name TEXT;

COMMENT ON COLUMN public.payment_methods.ip_name IS
  'Наименование ИП как видно в банковском чеке клиенту. Только для kind=ip_qr. Используется для авто-сверки Vision (нечёткое сравнение: lowercase + trim + удаление префикса "ИП ").';

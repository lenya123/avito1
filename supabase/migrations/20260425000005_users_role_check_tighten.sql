-- Stage 2.2 — Сужение CHECK на users.role.
--
-- После миграции orders.client_id → customer_id в users не должно остаться
-- записей с role='client' или role='seller'. Подчищаем историю и зажимаем
-- CHECK до трёх актуальных ролей.

-- activity_log.user_id ссылается на users без ON DELETE CASCADE; зануляем
-- ссылки перед DELETE, чтобы не нарваться на FK-violation.
UPDATE public.activity_log
  SET user_id = NULL
  WHERE user_id IN (SELECT id FROM public.users WHERE role IN ('client', 'seller'));

-- fraud_alerts.user_id тоже ссылается на users (Stage 2.6 мигрирует на customer_id).
UPDATE public.fraud_alerts
  SET user_id = NULL
  WHERE user_id IN (SELECT id FROM public.users WHERE role IN ('client', 'seller'));

-- notifications.user_id: уведомления для старых клиентов больше не нужны
-- (customer-bot в Stage 3 заменяет in-app-уведомления).
DELETE FROM public.notifications
  WHERE user_id IN (SELECT id FROM public.users WHERE role IN ('client', 'seller'));

-- product_notifications.user_id — аналогично (подписки клиентов на "товар появился").
DELETE FROM public.product_notifications
  WHERE user_id IN (SELECT id FROM public.users WHERE role IN ('client', 'seller'));

DELETE FROM public.users WHERE role IN ('client', 'seller');

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE public.users ADD CONSTRAINT users_role_check
  CHECK (role IN ('owner', 'shipper', 'admin'));

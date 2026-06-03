-- Phase A.5 — Удаляем orders.delivery_deadline.
--
-- В новой модели роль играет orders.send_by (см. 20260428000002_orders_new_fields.sql).
-- delivery_deadline был дефолт +7 дней от создания заказа в customer-bot wizard'е,
-- сейчас клиент задаёт send_by inline-календарём.
--
-- Зависимый индекс idx_orders_deadline уже снесён в 20260428000001 (он использовал
-- 'awaiting_shipment' в WHERE — пересекался со status enum merge).

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS delivery_deadline;

COMMENT ON COLUMN public.orders.send_by IS
  'Срок отгрузки (BUSINESS_LOGIC §4.5). Заменил orders.delivery_deadline.';

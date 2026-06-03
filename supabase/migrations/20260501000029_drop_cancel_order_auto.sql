-- Сносим мёртвую RPC cancel_order_auto (из 20260220000003).
-- Из app code не вызывается; внутри ссылки на удалённые поля
-- (users.deposit дропнут в Stage 1, orders.client_id переименован в
-- customer_id). При случайном вызове из Studio упадёт.

DROP FUNCTION IF EXISTS public.cancel_order_auto(UUID, TEXT);

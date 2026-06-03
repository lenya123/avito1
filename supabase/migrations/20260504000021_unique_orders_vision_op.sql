-- Anti-replay backstop (2/2): UNIQUE index на orders.vision_operation_id.
-- WHERE vision_operation_id IS NOT NULL — чтобы NULL-значения (legacy
-- orders / orders без Vision-оплаты) не считались дубликатами.
--
-- Защищает от race condition: два параллельных confirm_pending_order_atomic
-- с одним и тем же operation_id. БД даёт upsert одному, второй падает
-- с unique_violation, RPC бросит исключение, второй pending не подтвердится.
--
-- Если миграция падает — значит в БД уже есть дубликаты operation_id,
-- то есть один и тот же чек реально подтвердил два заказа (исторический
-- баг до этой защиты). Дубликаты надо найти и решить вручную:
--   SELECT vision_operation_id, COUNT(*), array_agg(order_number)
--     FROM orders WHERE vision_operation_id IS NOT NULL
--     GROUP BY 1 HAVING COUNT(*) > 1;

CREATE UNIQUE INDEX idx_orders_vision_operation_id_unique
  ON public.orders(vision_operation_id)
  WHERE vision_operation_id IS NOT NULL;

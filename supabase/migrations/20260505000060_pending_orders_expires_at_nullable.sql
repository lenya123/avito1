-- Снять NOT NULL с pending_orders.expires_at.
--
-- При исходном создании таблицы (20260501000002) колонка была NOT NULL —
-- предполагалось, что у любого pending есть 10-минутный TTL.
--
-- Но +ВАЙБ-долговые pending намеренно создаются без TTL: они либо сразу
-- instant-confirm'ятся (склад мой), либо ждут «N да» от партнёра (склад
-- его) без 10-минутного дедлайна. RPC create_pending_order_atomic v6
-- для этих случаев ставит expires_at = NULL — и до сих пор падал на
-- NOT-NULL constraint, делая +ВАЙБ-flow полностью неработоспособным.
--
-- Снимаем NOT NULL. Sweep'ы expired-pending'ов уже фильтруют по
-- expires_at IS NOT NULL.

ALTER TABLE public.pending_orders
  ALTER COLUMN expires_at DROP NOT NULL;

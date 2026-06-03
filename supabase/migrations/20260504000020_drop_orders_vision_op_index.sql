-- Anti-replay backstop (1/2): drop старый non-unique index на
-- orders.vision_operation_id. Был создан в 20260501000041 как обычный
-- index для скорости anti-replay-query. Заменим UNIQUE'ом в 000021,
-- чтобы БД физически не дала вставить два orders с одним operation_id
-- (защита от race condition при двух одновременных confirm'ах).
--
-- Pooler не даёт DROP+CREATE в одной миграции — поэтому два файла.

DROP INDEX IF EXISTS public.idx_orders_vision_operation_id;

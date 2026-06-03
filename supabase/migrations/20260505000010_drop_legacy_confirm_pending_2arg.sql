-- Накопившийся техдолг рефакторинга confirm_pending_order_atomic.
-- В Postgres `CREATE OR REPLACE FUNCTION` не заменяет старую функцию
-- если изменилась сигнатура — старая остаётся как отдельная overload.
-- За v1→v11 в БД накопились две живые подписи:
--   confirm_pending_order_atomic(p_pending_order_id uuid, p_payment_method text)         -- legacy v1-v4
--   confirm_pending_order_atomic(p_pending_order_id uuid, p_payment_method text, p_confirmed_by text)  -- v5+
-- Когда вызывающий код передавал только 2 аргумента (partner-bot, owner-API),
-- Postgres падал «Could not choose the best candidate function» — потому что
-- 3-арг версия имеет p_confirmed_by с DEFAULT, и обе подходят.
-- Дропаем legacy 2-арг подпись. v5+ остаётся единственной.

DROP FUNCTION IF EXISTS public.confirm_pending_order_atomic(uuid, text);

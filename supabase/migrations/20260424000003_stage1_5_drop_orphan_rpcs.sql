-- Этап 1.5 — чистка оставшихся seller-RPC.
--
-- stage1 дропнул append_seller_activity, block_client_for_seller,
-- unblock_client_for_seller (мигр. 20260423000002), но
-- get_seller_activity_log и get_seller_activity_recent_count остались.
-- Код на них не ссылается (после удаления seller-панели), поэтому удаляем
-- их здесь — чтобы `db:gen-types` перестал их тянуть.

DROP FUNCTION IF EXISTS public.get_seller_activity_log(UUID, INT, INT);
DROP FUNCTION IF EXISTS public.get_seller_activity_log(UUID);
DROP FUNCTION IF EXISTS public.get_seller_activity_recent_count(UUID);
DROP FUNCTION IF EXISTS public.get_seller_activity_recent_count(UUID, INT);

-- Polish (P2 #22): cleanup orphan trigger
-- Миграция 20260414000001 создала триггер sync_products_seller_id на колонке created_by.
-- Миграция 20260414000009 дропнула created_by — триггер остался, работает как no-op,
-- но шумит при dump/reset. Явно удаляем.

DROP TRIGGER IF EXISTS sync_products_seller_id ON public.products;
DROP FUNCTION IF EXISTS public.sync_products_seller_id();

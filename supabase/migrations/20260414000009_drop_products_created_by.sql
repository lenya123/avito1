-- ============================================================================
-- Drop deprecated products.created_by после миграции всех чтений на seller_id
-- ============================================================================
-- После миграций 20260414000001-8 колонка products.created_by больше не нужна:
-- - seller_id — first-class источник истины
-- - весь код читает и пишет через seller_id
-- - триггер sync_products_seller_id больше не нужен

DROP TRIGGER IF EXISTS trg_sync_products_seller_id ON products;
DROP FUNCTION IF EXISTS sync_products_seller_id();

ALTER TABLE products DROP COLUMN IF EXISTS created_by;

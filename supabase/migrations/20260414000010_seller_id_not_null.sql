-- ============================================================================
-- NOT NULL constraints на seller_id + инвариант main-seller
-- ============================================================================
-- После backfill в 20260414000001/000002/000003 все seller_id заполнены.
-- Ставим NOT NULL чтобы больше не могло появиться orphan-записей.
-- Плюс partial unique index на linked_owner_id — гарантируем, что у владельца
-- может быть только ОДИН main-seller.

-- Проверка перед NOT NULL (если есть NULL — миграция упадёт с понятной ошибкой)
DO $$
DECLARE
  v_products_null INT;
  v_orders_null INT;
BEGIN
  SELECT COUNT(*) INTO v_products_null FROM products WHERE seller_id IS NULL;
  SELECT COUNT(*) INTO v_orders_null FROM orders WHERE seller_id IS NULL;

  IF v_products_null > 0 THEN
    RAISE EXCEPTION 'Cannot set NOT NULL: % products have NULL seller_id. Run bootstrap_main_seller first.', v_products_null;
  END IF;

  IF v_orders_null > 0 THEN
    RAISE EXCEPTION 'Cannot set NOT NULL: % orders have NULL seller_id. Run bootstrap_main_seller first.', v_orders_null;
  END IF;
END $$;

ALTER TABLE products ALTER COLUMN seller_id SET NOT NULL;
ALTER TABLE orders ALTER COLUMN seller_id SET NOT NULL;

-- Инвариант: один main-seller на владельца
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_linked_owner_unique
  ON users(linked_owner_id)
  WHERE linked_owner_id IS NOT NULL;

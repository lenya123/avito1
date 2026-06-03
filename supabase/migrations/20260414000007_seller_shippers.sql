-- ============================================================================
-- Multi-seller phase A.8: seller_shippers (many-to-many)
-- ============================================================================
-- Каждый селлер подключает своих шипперов; один физический шипер может
-- работать на нескольких селлеров с разной ставкой у каждого.
-- users.shipper_rate деприкейтится (читается как fallback, но новые ставки
-- берутся из seller_shippers.rate). Удаление колонки — в следующем заходе.

CREATE TABLE IF NOT EXISTS seller_shippers (
  seller_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  shipper_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rate NUMERIC(10, 2) NOT NULL DEFAULT 50,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (seller_id, shipper_id)
);

CREATE INDEX IF NOT EXISTS idx_seller_shippers_shipper ON seller_shippers(shipper_id);
CREATE INDEX IF NOT EXISTS idx_seller_shippers_seller ON seller_shippers(seller_id);

ALTER TABLE seller_shippers ENABLE ROW LEVEL SECURITY;

-- RLS: шипер видит свои связки, селлер — свои, owner — все
DROP POLICY IF EXISTS "seller_shippers_select" ON seller_shippers;
CREATE POLICY "seller_shippers_select" ON seller_shippers FOR SELECT
  USING (
    public.is_owner()
    OR shipper_id = auth.uid()
    OR seller_id = auth.uid()
  );

DROP POLICY IF EXISTS "seller_shippers_modify_seller" ON seller_shippers;
CREATE POLICY "seller_shippers_modify_seller" ON seller_shippers FOR ALL
  USING (
    public.is_owner()
    OR (public.is_seller() AND seller_id = auth.uid())
  )
  WITH CHECK (
    public.is_owner()
    OR (public.is_seller() AND seller_id = auth.uid())
  );

-- Backfill: для каждого существующего shipper создаём строку с main-seller каждого owner,
-- копируя старую ставку из users.shipper_rate (если колонка ещё существует).
DO $$
DECLARE
  v_has_shipper_rate BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'shipper_rate'
  ) INTO v_has_shipper_rate;

  IF v_has_shipper_rate THEN
    INSERT INTO seller_shippers (seller_id, shipper_id, rate)
    SELECT main_seller.id, sh.id, COALESCE(sh.shipper_rate, 50)
    FROM users sh
    JOIN users owner ON owner.role = 'owner'
    JOIN users main_seller ON main_seller.role = 'seller' AND main_seller.linked_owner_id = owner.id
    WHERE sh.role = 'shipper'
    ON CONFLICT DO NOTHING;
  ELSE
    INSERT INTO seller_shippers (seller_id, shipper_id, rate)
    SELECT main_seller.id, sh.id, 50
    FROM users sh
    JOIN users owner ON owner.role = 'owner'
    JOIN users main_seller ON main_seller.role = 'seller' AND main_seller.linked_owner_id = owner.id
    WHERE sh.role = 'shipper'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Notification kind для приглашения шипера к новому селлеру (если enum есть)
-- Уведомление уходит через Telegram из application layer.

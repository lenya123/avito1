-- =====================================================
-- Миграция 3: Row Level Security (RLS)
-- =====================================================

-- Включение RLS на всех таблицах
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_sizes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE shipper_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE size_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_fingerprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_points ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- Вспомогательные функции (в схеме public)
-- =====================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_shipper()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'shipper');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_client()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'client');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_premium_client()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND (is_vibe_plus = TRUE OR subscription_tier IN ('premium', 'top_floor_boss'))
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =====================================================
-- Политики: users
-- =====================================================

CREATE POLICY "users_select" ON users FOR SELECT
  USING (id = auth.uid() OR public.is_owner());

CREATE POLICY "users_update_self" ON users FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "users_update_owner" ON users FOR UPDATE
  USING (public.is_owner());

CREATE POLICY "users_insert_owner" ON users FOR INSERT
  WITH CHECK (public.is_owner());

-- =====================================================
-- Политики: products
-- =====================================================

CREATE POLICY "products_select_all" ON products FOR SELECT
  USING (
    public.is_owner() OR (
      is_active = TRUE AND (
        is_premium = FALSE OR public.is_premium_client()
      ) AND (
        is_in_stock = TRUE OR public.is_premium_client()
      )
    )
  );

CREATE POLICY "products_modify_owner" ON products FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: product_sizes
-- =====================================================

CREATE POLICY "product_sizes_select" ON product_sizes FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_sizes.product_id
      AND (
        public.is_owner() OR (
          p.is_active = TRUE AND (
            p.is_premium = FALSE OR public.is_premium_client()
          )
        )
      )
    )
  );

CREATE POLICY "product_sizes_modify_owner" ON product_sizes FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: orders
-- =====================================================

CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (
    client_id = auth.uid() OR public.is_owner() OR (
      public.is_shipper() AND status IN (
        'awaiting_shipment', 'collecting', 'in_transit',
        'return_in_transit', 'return_arrived'
      )
    )
  );

CREATE POLICY "orders_insert" ON orders FOR INSERT
  WITH CHECK (client_id = auth.uid() OR public.is_owner());

CREATE POLICY "orders_update_client" ON orders FOR UPDATE
  USING (client_id = auth.uid() AND status = 'pending_payment')
  WITH CHECK (client_id = auth.uid());

CREATE POLICY "orders_update_owner" ON orders FOR UPDATE
  USING (public.is_owner());

CREATE POLICY "orders_update_shipper" ON orders FOR UPDATE
  USING (
    public.is_shipper() AND status IN ('awaiting_shipment', 'collecting', 'return_arrived')
  );

-- =====================================================
-- Политики: payments
-- =====================================================

CREATE POLICY "payments_select" ON payments FOR SELECT
  USING (user_id = auth.uid() OR public.is_owner());

CREATE POLICY "payments_insert" ON payments FOR INSERT
  WITH CHECK (user_id = auth.uid() OR public.is_owner());

CREATE POLICY "payments_update_owner" ON payments FOR UPDATE
  USING (public.is_owner());

-- =====================================================
-- Политики: favorites
-- =====================================================

CREATE POLICY "favorites_all" ON favorites FOR ALL
  USING (user_id = auth.uid());

-- =====================================================
-- Политики: product_notifications
-- =====================================================

CREATE POLICY "product_notifications_all" ON product_notifications FOR ALL
  USING (user_id = auth.uid());

-- =====================================================
-- Политики: referral_bonuses
-- =====================================================

CREATE POLICY "referral_bonuses_select" ON referral_bonuses FOR SELECT
  USING (referrer_id = auth.uid() OR referral_id = auth.uid() OR public.is_owner());

CREATE POLICY "referral_bonuses_modify_owner" ON referral_bonuses FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: shipper_stats
-- =====================================================

CREATE POLICY "shipper_stats_select" ON shipper_stats FOR SELECT
  USING (shipper_id = auth.uid() OR public.is_owner());

CREATE POLICY "shipper_stats_modify_owner" ON shipper_stats FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: expenses
-- =====================================================

CREATE POLICY "expenses_owner_only" ON expenses FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: activity_log
-- =====================================================

CREATE POLICY "activity_log_owner_only" ON activity_log FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: notifications
-- =====================================================

CREATE POLICY "notifications_select" ON notifications FOR SELECT
  USING (user_id = auth.uid() OR public.is_owner());

CREATE POLICY "notifications_update_self" ON notifications FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "notifications_modify_owner" ON notifications FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: settings
-- =====================================================

CREATE POLICY "settings_select_all" ON settings FOR SELECT
  USING (TRUE);

CREATE POLICY "settings_modify_owner" ON settings FOR UPDATE
  USING (public.is_owner());

-- =====================================================
-- Политики: size_reservations
-- =====================================================

CREATE POLICY "size_reservations_select" ON size_reservations FOR SELECT
  USING (user_id = auth.uid() OR public.is_owner());

CREATE POLICY "size_reservations_insert" ON size_reservations FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "size_reservations_delete" ON size_reservations FOR DELETE
  USING (user_id = auth.uid() OR public.is_owner());

-- =====================================================
-- Политики: user_fingerprints
-- =====================================================

CREATE POLICY "user_fingerprints_owner_only" ON user_fingerprints FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: fraud_alerts
-- =====================================================

CREATE POLICY "fraud_alerts_owner_only" ON fraud_alerts FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: suppliers
-- =====================================================

CREATE POLICY "suppliers_owner_only" ON suppliers FOR ALL
  USING (public.is_owner());

-- =====================================================
-- Политики: pickup_points
-- =====================================================

CREATE POLICY "pickup_points_select" ON pickup_points FOR SELECT
  USING (is_active = TRUE OR public.is_owner());

CREATE POLICY "pickup_points_modify_owner" ON pickup_points FOR ALL
  USING (public.is_owner());

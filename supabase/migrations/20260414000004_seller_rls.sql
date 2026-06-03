-- ============================================================================
-- Multi-seller phase A.5: RLS для роли seller
-- ============================================================================
-- Добавляет is_seller() и политики изоляции данных селлеров на уровне БД.
-- API routes продолжают работать через service_role (обход RLS), но при
-- будущем переходе на authenticated клиента селлеры физически не смогут
-- увидеть/изменить чужие данные.

CREATE OR REPLACE FUNCTION public.is_seller()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'seller');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================================
-- products: селлер видит/модифицирует только свои, owner — все
-- ============================================================================

DROP POLICY IF EXISTS "products_modify_owner" ON products;
DROP POLICY IF EXISTS "products_select_all" ON products;

CREATE POLICY "products_select" ON products FOR SELECT
  USING (
    public.is_owner()
    OR (public.is_seller() AND seller_id = auth.uid())
    OR (
      is_active = TRUE
      AND (is_premium = FALSE OR public.is_premium_client())
      AND (is_in_stock = TRUE OR public.is_premium_client())
      AND EXISTS (SELECT 1 FROM users u WHERE u.id = products.seller_id AND COALESCE(u.is_blocked, FALSE) = FALSE)
    )
  );

CREATE POLICY "products_modify_owner" ON products FOR ALL
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY "products_insert_seller" ON products FOR INSERT
  WITH CHECK (public.is_seller() AND seller_id = auth.uid());

CREATE POLICY "products_update_seller" ON products FOR UPDATE
  USING (public.is_seller() AND seller_id = auth.uid())
  WITH CHECK (public.is_seller() AND seller_id = auth.uid());

CREATE POLICY "products_delete_seller" ON products FOR DELETE
  USING (public.is_seller() AND seller_id = auth.uid());

-- ============================================================================
-- product_sizes: через владение родительским product
-- ============================================================================

DROP POLICY IF EXISTS "product_sizes_modify_owner" ON product_sizes;

CREATE POLICY "product_sizes_modify_seller" ON product_sizes FOR ALL
  USING (
    public.is_owner()
    OR EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_sizes.product_id
      AND public.is_seller()
      AND p.seller_id = auth.uid()
    )
  )
  WITH CHECK (
    public.is_owner()
    OR EXISTS (
      SELECT 1 FROM products p
      WHERE p.id = product_sizes.product_id
      AND public.is_seller()
      AND p.seller_id = auth.uid()
    )
  );

-- ============================================================================
-- orders: селлер видит заказы по своему seller_id
-- ============================================================================

DROP POLICY IF EXISTS "orders_select" ON orders;

CREATE POLICY "orders_select" ON orders FOR SELECT
  USING (
    client_id = auth.uid()
    OR public.is_owner()
    OR (public.is_seller() AND seller_id = auth.uid())
    OR (
      public.is_shipper() AND status IN (
        'awaiting_shipment', 'collecting', 'in_transit',
        'return_in_transit', 'return_arrived'
      )
    )
  );

CREATE POLICY "orders_update_seller" ON orders FOR UPDATE
  USING (public.is_seller() AND seller_id = auth.uid())
  WITH CHECK (public.is_seller() AND seller_id = auth.uid());

-- ============================================================================
-- size_reservations: селлер видит резервы своих товаров
-- ============================================================================

CREATE POLICY "size_reservations_select_seller" ON size_reservations FOR SELECT
  USING (
    public.is_seller() AND EXISTS (
      SELECT 1 FROM products p
      WHERE (p.id = size_reservations.product_id
             OR p.id = (SELECT product_id FROM product_sizes WHERE id = size_reservations.product_size_id))
      AND p.seller_id = auth.uid()
    )
  );

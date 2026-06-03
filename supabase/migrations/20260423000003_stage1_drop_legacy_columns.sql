-- Этап 1 пивота на B2B SaaS: удаление устаревших колонок клиентской/селлерской эпохи.
--
-- users — убираем всё про подписки, уровни, +ВАЙБ (старый), рефералы, ЮKassa-onboarding,
-- настройки клиентских уведомлений и депозиты. Остаются только поля необходимые для
-- owner/shipper/admin авторизации.
--
-- orders — убираем селлерскую денормализацию (seller_id, fee_*, platform_fee, seller_net_amount)
-- и ЮKassa-заготовки. client_id остаётся до Этапа 2.
--
-- products — убираем seller_id.
--
-- settings — убираем platform_commission_pct и referral_percent.
--
-- CASCADE — удаляет зависимые объекты (триггеры, views, constraints). Это безопасно:
-- после пивота все эти зависимости тоже устарели.

-- =====================================================================
-- 1. users — удалить клиентские/селлерские/устаревшие поля
-- =====================================================================

ALTER TABLE public.users
  DROP COLUMN IF EXISTS subscription_tier CASCADE,
  DROP COLUMN IF EXISTS subscription_start CASCADE,
  DROP COLUMN IF EXISTS subscription_end CASCADE,
  DROP COLUMN IF EXISTS scheduled_subscription_tier CASCADE,
  DROP COLUMN IF EXISTS level CASCADE,
  DROP COLUMN IF EXISTS deposit CASCADE,
  DROP COLUMN IF EXISTS referral_deposit CASCADE,
  DROP COLUMN IF EXISTS is_vibe_plus CASCADE,
  DROP COLUMN IF EXISTS deposit_limit CASCADE,
  DROP COLUMN IF EXISTS discount_percent CASCADE,
  DROP COLUMN IF EXISTS total_completed_orders CASCADE,
  DROP COLUMN IF EXISTS is_onboarding_completed CASCADE,
  DROP COLUMN IF EXISTS linked_owner_id CASCADE,
  DROP COLUMN IF EXISTS referral_code CASCADE,
  DROP COLUMN IF EXISTS referred_by CASCADE,
  DROP COLUMN IF EXISTS first_order_discount_used CASCADE,
  DROP COLUMN IF EXISTS yookassa_shop_id CASCADE,
  DROP COLUMN IF EXISTS yookassa_onboarding_status CASCADE,
  DROP COLUMN IF EXISTS notification_order_status CASCADE,
  DROP COLUMN IF EXISTS notification_new_products CASCADE,
  DROP COLUMN IF EXISTS notification_promotions CASCADE;

-- shop_name оставляем до Этапа 2 — переедет в business_settings.business_name.
-- avito_* оставляем до Этапа 9.

-- =====================================================================
-- 2. orders — убираем селлерскую денормализацию и ЮKassa-заготовки
-- =====================================================================

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS seller_id CASCADE,
  DROP COLUMN IF EXISTS fee_pct_snapshot CASCADE,
  DROP COLUMN IF EXISTS platform_fee_amount CASCADE,
  DROP COLUMN IF EXISTS seller_net_amount CASCADE,
  DROP COLUMN IF EXISTS yookassa_payment_id CASCADE,
  DROP COLUMN IF EXISTS yookassa_deal_id CASCADE,
  DROP COLUMN IF EXISTS acquiring_fee_amount CASCADE;

-- client_id остаётся до Этапа 2.

-- =====================================================================
-- 3. products — убираем seller_id
-- =====================================================================

ALTER TABLE public.products
  DROP COLUMN IF EXISTS seller_id CASCADE;

-- =====================================================================
-- 4. settings — убираем комиссии и рефералы
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'settings'
               AND column_name = 'platform_commission_pct') THEN
    ALTER TABLE public.settings DROP COLUMN platform_commission_pct CASCADE;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = 'settings'
               AND column_name = 'referral_percent') THEN
    ALTER TABLE public.settings DROP COLUMN referral_percent CASCADE;
  END IF;
END $$;

-- =====================================================================
-- 5. Очистка RLS-политик client-role и seller-role
-- =====================================================================

DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        policyname ILIKE '%_select_client%' OR
        policyname ILIKE '%_modify_client%' OR
        policyname ILIKE '%_insert_client%' OR
        policyname ILIKE '%_update_client%' OR
        policyname ILIKE '%_delete_client%' OR
        policyname ILIKE '%_select_seller%' OR
        policyname ILIKE '%_modify_seller%' OR
        policyname ILIKE '%_insert_seller%' OR
        policyname ILIKE '%_update_seller%' OR
        policyname ILIKE '%_delete_seller%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
      pol.policyname, pol.schemaname, pol.tablename);
  END LOOP;
END $$;

-- =====================================================================
-- 6. Добавляем is_admin() и обновляем is_owner()/is_shipper() под admin-роль
-- =====================================================================

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_shipper()
RETURNS BOOLEAN LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('shipper', 'owner', 'admin')
  );
$$;

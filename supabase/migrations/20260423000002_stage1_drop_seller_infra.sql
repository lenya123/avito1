-- Этап 1 пивота на B2B SaaS: удаление мульти-селлерной инфраструктуры.
--
-- После пивота каждая инсталляция принадлежит одному владельцу — "селлер" как роль и
-- множество магазинов исчезают. Остаются только owner + shipper (+ admin как вендорская роль).
-- shipper_ledger_entries и shipper_payout_periods сохраняются, но упрощаются (убирается seller_id).
-- Селлерские триггеры credit/clawback удаляются — все заказы принадлежат одному владельцу.

-- =====================================================================
-- 1. Удаляем триггеры на orders (сначала — чтобы не мешали DROP COLUMN)
-- =====================================================================

DROP TRIGGER IF EXISTS trg_orders_set_seller_id ON public.orders;
DROP FUNCTION IF EXISTS public.orders_set_seller_id();

DROP TRIGGER IF EXISTS ledger_on_order_status_change ON public.orders;
DROP FUNCTION IF EXISTS public.ledger_on_order_status_change();

DROP TRIGGER IF EXISTS orders_fee_snapshot_trg ON public.orders;
DROP FUNCTION IF EXISTS public.orders_fee_snapshot();

-- =====================================================================
-- 2. Удаляем селлерские функции / RPC / админ-RPC селлеров
-- =====================================================================

DROP FUNCTION IF EXISTS public.mark_seller_payout_paid(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.cancel_seller_payout(UUID);
DROP FUNCTION IF EXISTS public.build_seller_payouts_for_period(DATE, DATE);
DROP FUNCTION IF EXISTS public.block_seller(UUID, TEXT);
DROP FUNCTION IF EXISTS public.unblock_seller(UUID);
-- CASCADE удаляет зависимые RLS-политики, которые ссылаются на эти функции
-- (products_select/insert_seller/update_seller/delete_seller, orders_select/update_seller,
--  product_sizes_modify_seller, size_reservations_select_seller, seller_shippers_modify_seller).
-- Политики в любом случае удаляются пивотом (client/seller-ветви уходят).
DROP FUNCTION IF EXISTS public.is_seller() CASCADE;
DROP FUNCTION IF EXISTS public.is_client() CASCADE;

-- Селлерские RPC из более поздних миграций (activity log / goals / blocked clients)
DROP FUNCTION IF EXISTS public.append_seller_activity(UUID, TEXT, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.block_client_for_seller(UUID, UUID, TEXT);
DROP FUNCTION IF EXISTS public.unblock_client_for_seller(UUID, UUID);

-- =====================================================================
-- 3. Удаляем селлерские таблицы (порядок важен из-за FK)
-- =====================================================================

-- Сначала зависимые
DROP TABLE IF EXISTS public.seller_payout_adjustments CASCADE;
DROP TABLE IF EXISTS public.seller_payout_items CASCADE;
DROP TABLE IF EXISTS public.seller_payouts CASCADE;
DROP TABLE IF EXISTS public.seller_ledger_entries CASCADE;

-- Many-to-many + связанные селлерские служебные таблицы
DROP TABLE IF EXISTS public.seller_shippers CASCADE;
DROP TABLE IF EXISTS public.seller_activity_log CASCADE;
DROP TABLE IF EXISTS public.seller_goals CASCADE;
DROP TABLE IF EXISTS public.seller_blocked_clients CASCADE;

-- Реферальная система (клиентская)
DROP TABLE IF EXISTS public.referral_bonuses CASCADE;

-- =====================================================================
-- 4. Упрощаем shipper_ledger_entries и shipper_payout_periods под моно-бизнес
--    (убираем seller_id — single-tenant, ссылка на селлера не нужна)
-- =====================================================================

-- RLS-политики которые ссылались на seller_id — удаляем ПЕРЕД DROP COLUMN
DROP POLICY IF EXISTS shipper_payout_periods_select_seller ON public.shipper_payout_periods;
DROP POLICY IF EXISTS shipper_ledger_select_seller ON public.shipper_ledger_entries;

-- Unique на (shipper_id, seller_id, period_start, period_end) — сбросим на (shipper_id, period_start, period_end)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'shipper_payout_periods_shipper_id_seller_id_period_start_pe_key'
      AND conrelid = 'public.shipper_payout_periods'::regclass
  ) THEN
    ALTER TABLE public.shipper_payout_periods
      DROP CONSTRAINT shipper_payout_periods_shipper_id_seller_id_period_start_pe_key;
  END IF;
END $$;

ALTER TABLE public.shipper_payout_periods DROP COLUMN IF EXISTS seller_id;

ALTER TABLE public.shipper_payout_periods
  ADD CONSTRAINT shipper_payout_periods_unique_period
  UNIQUE (shipper_id, period_start, period_end);

ALTER TABLE public.shipper_ledger_entries DROP COLUMN IF EXISTS seller_id;

-- =====================================================================
-- 5. Обновляем триггер shipper_ledger_on_order_completed под новую схему
-- =====================================================================

CREATE OR REPLACE FUNCTION public.shipper_ledger_on_order_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shipper_id UUID;
  v_rate NUMERIC(12,2);
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    v_rate := COALESCE(NEW.shipper_rate_snapshot, 0);
    IF v_rate <= 0 THEN RETURN NEW; END IF;

    v_shipper_id := NEW.shipped_by;
    IF v_shipper_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.shipper_ledger_entries (shipper_id, order_id, kind, amount)
    VALUES (v_shipper_id, NEW.id, 'credit', v_rate)
    ON CONFLICT (order_id, kind) WHERE kind = 'credit' DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

-- =====================================================================
-- 6. Обновляем build_shipper_payouts_for_period без seller_id
-- =====================================================================

-- Return type меняется (убираем out_seller_id) → нужен явный DROP перед CREATE
DROP FUNCTION IF EXISTS public.build_shipper_payouts_for_period(DATE, DATE);

CREATE OR REPLACE FUNCTION public.build_shipper_payouts_for_period(
  p_period_start DATE,
  p_period_end DATE
) RETURNS TABLE (out_shipper_id UUID, out_payout_id UUID, out_amount NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_payout_id UUID;
BEGIN
  FOR r IN
    SELECT
      sle.shipper_id,
      SUM(sle.amount) AS total,
      COUNT(*) AS orders_count
    FROM public.shipper_ledger_entries sle
    JOIN public.orders o ON o.id = sle.order_id
    WHERE sle.kind = 'credit'
      AND sle.ref_payout_id IS NULL
      AND o.completed_at::DATE BETWEEN p_period_start AND p_period_end
    GROUP BY sle.shipper_id
  LOOP
    INSERT INTO public.shipper_payout_periods (
      shipper_id, period_start, period_end, total_amount, orders_count
    ) VALUES (
      r.shipper_id, p_period_start, p_period_end, r.total, r.orders_count
    )
    ON CONFLICT (shipper_id, period_start, period_end) DO NOTHING
    RETURNING id INTO v_payout_id;

    IF v_payout_id IS NOT NULL THEN
      UPDATE public.shipper_ledger_entries
        SET ref_payout_id = v_payout_id
        WHERE shipper_id = r.shipper_id
          AND kind = 'credit'
          AND ref_payout_id IS NULL
          AND order_id IN (
            SELECT id FROM public.orders
            WHERE completed_at::DATE BETWEEN p_period_start AND p_period_end
          );

      out_shipper_id := r.shipper_id;
      out_payout_id := v_payout_id;
      out_amount := r.total;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.build_shipper_payouts_for_period(DATE, DATE) TO service_role;

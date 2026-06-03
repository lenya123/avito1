-- M4: Seller payouts — еженедельная группировка ledger credits в выплаты
-- Статусы: pending (сформирован) → paid (выплачен) / cancelled (отменён)
-- Items: детализация по заказам внутри payout
-- Adjustments: clawback после уже выплаченного payout (попадает в следующий)

-- 1. Seller payouts (группировка за период)
CREATE TABLE public.seller_payouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipper_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  clawback_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  reserve_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payable_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES public.users(id),
  note TEXT,
  provider TEXT NOT NULL DEFAULT 'manual'
    CHECK (provider IN ('manual', 'yookassa')),
  external_payout_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (seller_id, period_start, period_end)
);

CREATE INDEX seller_payouts_seller_status_idx
  ON public.seller_payouts (seller_id, status);

CREATE INDEX seller_payouts_pending_idx
  ON public.seller_payouts (status)
  WHERE status = 'pending';

-- 2. Payout items (детализация по заказам)
CREATE TABLE public.seller_payout_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_id UUID NOT NULL REFERENCES public.seller_payouts(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  ledger_entry_id UUID NOT NULL REFERENCES public.seller_ledger_entries(id) ON DELETE RESTRICT,
  gross_amount NUMERIC(12,2) NOT NULL,
  commission_amount NUMERIC(12,2) NOT NULL,
  shipper_amount NUMERIC(12,2) NOT NULL,
  net_amount NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (payout_id, order_id)
);

CREATE INDEX seller_payout_items_order_idx
  ON public.seller_payout_items (order_id);

-- 3. Payout adjustments (clawback после paid payout)
CREATE TABLE public.seller_payout_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  order_id UUID REFERENCES public.orders(id),
  amount NUMERIC(12,2) NOT NULL,
  reason TEXT NOT NULL,
  source_payout_id UUID REFERENCES public.seller_payouts(id),
  applied_to_payout_id UUID REFERENCES public.seller_payouts(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX seller_adjustments_pending_idx
  ON public.seller_payout_adjustments (seller_id)
  WHERE applied_to_payout_id IS NULL;

-- 4. RLS
ALTER TABLE public.seller_payouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payout_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.seller_payout_adjustments ENABLE ROW LEVEL SECURITY;

-- Селлер видит свои
CREATE POLICY seller_payouts_select_own ON public.seller_payouts
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY seller_payouts_select_owner ON public.seller_payouts
  FOR SELECT TO authenticated
  USING (is_owner());

CREATE POLICY seller_payout_items_select_own ON public.seller_payout_items
  FOR SELECT TO authenticated
  USING (
    payout_id IN (SELECT id FROM public.seller_payouts WHERE seller_id = auth.uid())
  );

CREATE POLICY seller_payout_items_select_owner ON public.seller_payout_items
  FOR SELECT TO authenticated
  USING (is_owner());

CREATE POLICY seller_adjustments_select_own ON public.seller_payout_adjustments
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY seller_adjustments_select_owner ON public.seller_payout_adjustments
  FOR SELECT TO authenticated
  USING (is_owner());

-- Все INSERT/UPDATE/DELETE — только service_role

-- 5. Добавить FK от seller_ledger_entries.ref_payout_id → seller_payouts
ALTER TABLE public.seller_ledger_entries
  ADD CONSTRAINT seller_ledger_ref_payout_fk
  FOREIGN KEY (ref_payout_id) REFERENCES public.seller_payouts(id);

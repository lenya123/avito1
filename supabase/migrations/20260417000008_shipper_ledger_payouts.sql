-- M6: Shipper ledger + payout periods (зеркально seller)
-- Существующая таблица shipper_payouts (простой лог amount/note) остаётся как есть.
-- Новые таблицы: shipper_ledger_entries + shipper_payout_periods (структурированные выплаты).

-- 1. Shipper ledger entries
CREATE TABLE public.shipper_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'debit_payout')),
  amount NUMERIC(12,2) NOT NULL,
  ref_payout_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX shipper_ledger_order_kind_idx
  ON public.shipper_ledger_entries (order_id, kind)
  WHERE kind = 'credit';

CREATE INDEX shipper_ledger_shipper_idx
  ON public.shipper_ledger_entries (shipper_id, created_at DESC);

-- 2. Shipper payout periods (структурированные, per shipper+seller)
CREATE TABLE public.shipper_payout_periods (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  orders_count INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES public.users(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (shipper_id, seller_id, period_start, period_end)
);

CREATE INDEX shipper_payout_periods_shipper_idx
  ON public.shipper_payout_periods (shipper_id, status);

-- 3. RLS
ALTER TABLE public.shipper_ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipper_payout_periods ENABLE ROW LEVEL SECURITY;

-- Шипер видит свои
CREATE POLICY shipper_ledger_select_own ON public.shipper_ledger_entries
  FOR SELECT TO authenticated
  USING (shipper_id = auth.uid());

-- Селлер видит записи своих шиперов
CREATE POLICY shipper_ledger_select_seller ON public.shipper_ledger_entries
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- Owner видит все
CREATE POLICY shipper_ledger_select_owner ON public.shipper_ledger_entries
  FOR SELECT TO authenticated
  USING (is_owner());

CREATE POLICY shipper_payout_periods_select_own ON public.shipper_payout_periods
  FOR SELECT TO authenticated
  USING (shipper_id = auth.uid());

CREATE POLICY shipper_payout_periods_select_seller ON public.shipper_payout_periods
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

CREATE POLICY shipper_payout_periods_select_owner ON public.shipper_payout_periods
  FOR SELECT TO authenticated
  USING (is_owner());

-- 4. Триггер: авто-credit шиперу при completed (shipper_rate_snapshot)
-- Шипер НЕ получает clawback при return — услуга доставки уже оказана
CREATE OR REPLACE FUNCTION public.shipper_ledger_on_order_completed()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shipper_id UUID;
  v_rate NUMERIC(12,2);
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    v_rate := COALESCE(NEW.shipper_rate_snapshot, 0);
    IF v_rate <= 0 THEN RETURN NEW; END IF;

    -- Найти шипера, который отгрузил этот заказ
    v_shipper_id := NEW.shipped_by;
    IF v_shipper_id IS NULL THEN RETURN NEW; END IF;

    INSERT INTO public.shipper_ledger_entries (shipper_id, seller_id, order_id, kind, amount)
    VALUES (v_shipper_id, NEW.seller_id, NEW.id, 'credit', v_rate)
    ON CONFLICT (order_id, kind) WHERE kind = 'credit' DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER shipper_ledger_on_order_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.shipper_ledger_on_order_completed();

-- 5. RPC: build shipper payouts for period
CREATE OR REPLACE FUNCTION public.build_shipper_payouts_for_period(
  p_period_start DATE,
  p_period_end DATE
) RETURNS TABLE (out_shipper_id UUID, out_seller_id UUID, out_payout_id UUID, out_amount NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_payout_id UUID;
BEGIN
  FOR r IN
    SELECT
      sle.shipper_id,
      sle.seller_id,
      SUM(sle.amount) AS total,
      COUNT(*) AS orders_count
    FROM public.shipper_ledger_entries sle
    JOIN public.orders o ON o.id = sle.order_id
    WHERE sle.kind = 'credit'
      AND sle.ref_payout_id IS NULL
      AND o.completed_at::DATE BETWEEN p_period_start AND p_period_end
    GROUP BY sle.shipper_id, sle.seller_id
  LOOP
    INSERT INTO public.shipper_payout_periods (
      shipper_id, seller_id, period_start, period_end,
      total_amount, orders_count
    ) VALUES (
      r.shipper_id, r.seller_id, p_period_start, p_period_end,
      r.total, r.orders_count
    )
    ON CONFLICT (shipper_id, seller_id, period_start, period_end) DO NOTHING
    RETURNING id INTO v_payout_id;

    IF v_payout_id IS NOT NULL THEN
      UPDATE public.shipper_ledger_entries
        SET ref_payout_id = v_payout_id
        WHERE shipper_id = r.shipper_id
          AND seller_id = r.seller_id
          AND kind = 'credit'
          AND ref_payout_id IS NULL
          AND order_id IN (
            SELECT id FROM public.orders
            WHERE completed_at::DATE BETWEEN p_period_start AND p_period_end
          );

      out_shipper_id := r.shipper_id;
      out_seller_id := r.seller_id;
      out_payout_id := v_payout_id;
      out_amount := r.total;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

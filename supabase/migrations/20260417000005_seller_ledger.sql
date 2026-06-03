-- M3: Seller ledger — real-time баланс селлера
-- Credit при completed, clawback при return_completed
-- Основа для seller_payouts (M4) и finance dashboard (Фаза 3)

-- 1. Таблица ledger entries
CREATE TABLE public.seller_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  kind TEXT NOT NULL CHECK (kind IN ('credit', 'clawback', 'debit_payout')),
  amount NUMERIC(12,2) NOT NULL,
  ref_payout_id UUID,  -- заполняется при привязке к seller_payouts (M4)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Один credit и один clawback максимум на заказ (идемпотентность триггера)
CREATE UNIQUE INDEX seller_ledger_order_kind_idx
  ON public.seller_ledger_entries (order_id, kind)
  WHERE kind IN ('credit', 'clawback');

CREATE INDEX seller_ledger_seller_idx
  ON public.seller_ledger_entries (seller_id, created_at DESC);

CREATE INDEX seller_ledger_payout_ref_idx
  ON public.seller_ledger_entries (ref_payout_id)
  WHERE ref_payout_id IS NOT NULL;

-- 2. RLS
ALTER TABLE public.seller_ledger_entries ENABLE ROW LEVEL SECURITY;

-- Селлер видит только свои записи
CREATE POLICY seller_ledger_select_own ON public.seller_ledger_entries
  FOR SELECT TO authenticated
  USING (seller_id = auth.uid());

-- Owner видит все
CREATE POLICY seller_ledger_select_owner ON public.seller_ledger_entries
  FOR SELECT TO authenticated
  USING (is_owner());

-- INSERT/UPDATE/DELETE — только service_role (через триггеры и RPC)
-- Нет политик на INSERT/UPDATE/DELETE для authenticated = заблокировано

-- 3. Триггер: авто-credit при completed, авто-clawback при return_completed
CREATE OR REPLACE FUNCTION public.ledger_on_order_status_change()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_is_main BOOLEAN;
  v_net NUMERIC(12,2);
BEGIN
  -- Проверяем, не main-seller ли (владелец сам себе не платит)
  SELECT (u.linked_owner_id IS NOT NULL) INTO v_is_main
    FROM public.users u WHERE u.id = NEW.seller_id;
  IF v_is_main THEN RETURN NEW; END IF;

  -- === CREDIT при completed ===
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    v_net := COALESCE(NEW.seller_net_amount,
      NEW.client_price - COALESCE(NEW.platform_fee_amount, 0) - COALESCE(NEW.shipper_rate_snapshot, 0));

    IF v_net > 0 THEN
      INSERT INTO public.seller_ledger_entries (seller_id, order_id, kind, amount)
      VALUES (NEW.seller_id, NEW.id, 'credit', v_net)
      ON CONFLICT (order_id, kind) WHERE kind IN ('credit', 'clawback') DO NOTHING;
    END IF;
  END IF;

  -- === CLAWBACK при return_completed ===
  IF NEW.status = 'return_completed' AND (OLD.status IS DISTINCT FROM 'return_completed') THEN
    v_net := COALESCE(NEW.seller_net_amount,
      NEW.client_price - COALESCE(NEW.platform_fee_amount, 0) - COALESCE(NEW.shipper_rate_snapshot, 0));

    IF v_net > 0 THEN
      INSERT INTO public.seller_ledger_entries (seller_id, order_id, kind, amount)
      VALUES (NEW.seller_id, NEW.id, 'clawback', v_net)
      ON CONFLICT (order_id, kind) WHERE kind IN ('credit', 'clawback') DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER ledger_on_order_status_change
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.ledger_on_order_status_change();

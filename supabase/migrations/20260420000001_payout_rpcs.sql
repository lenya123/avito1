-- Polish (B4): атомарные RPC mark_seller_payout_paid + cancel_seller_payout
-- + order_id nullable для debit_payout (одна агрегированная запись вместо ложного firstOrderId)

-- 1. order_id nullable + CHECK
ALTER TABLE public.seller_ledger_entries
  ALTER COLUMN order_id DROP NOT NULL;

ALTER TABLE public.seller_ledger_entries
  ADD CONSTRAINT seller_ledger_order_id_required
  CHECK (kind = 'debit_payout' OR order_id IS NOT NULL);

-- 2. mark_seller_payout_paid: атомарный UPDATE + INSERT debit_payout
CREATE OR REPLACE FUNCTION public.mark_seller_payout_paid(
  p_payout_id UUID,
  p_paid_by UUID,
  p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_seller_id UUID;
  v_sum NUMERIC(12,2);
BEGIN
  UPDATE public.seller_payouts
     SET status = 'paid',
         paid_at = NOW(),
         paid_by = p_paid_by,
         note = COALESCE(p_note, note)
   WHERE id = p_payout_id
     AND status = 'pending'
  RETURNING seller_id INTO v_seller_id;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Payout % not found or not pending', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM public.seller_ledger_entries
   WHERE ref_payout_id = p_payout_id
     AND kind = 'credit';

  IF v_sum > 0 THEN
    INSERT INTO public.seller_ledger_entries
      (seller_id, order_id, kind, amount, ref_payout_id)
    VALUES
      (v_seller_id, NULL, 'debit_payout', v_sum, p_payout_id);
  END IF;
END $$;

-- 3. cancel_seller_payout: атомарный UPDATE + UNLINK credits
CREATE OR REPLACE FUNCTION public.cancel_seller_payout(
  p_payout_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_found UUID;
BEGIN
  UPDATE public.seller_payouts
     SET status = 'cancelled'
   WHERE id = p_payout_id
     AND status = 'pending'
  RETURNING id INTO v_found;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Payout % not found or not pending', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.seller_ledger_entries
     SET ref_payout_id = NULL
   WHERE ref_payout_id = p_payout_id
     AND kind = 'credit';
END $$;

-- 4. GRANT
GRANT EXECUTE ON FUNCTION public.mark_seller_payout_paid(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_seller_payout(UUID) TO service_role;

COMMENT ON FUNCTION public.mark_seller_payout_paid IS
  'Атомарно переводит pending-выплату в paid и создаёт одну агрегированную debit_payout запись (order_id=NULL, amount=SUM credits). Raises P0002 если выплата не pending.';
COMMENT ON FUNCTION public.cancel_seller_payout IS
  'Атомарно отменяет pending-выплату и возвращает привязанные credit-записи в доступный пул (ref_payout_id=NULL). Raises P0002 если выплата не pending.';

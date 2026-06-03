-- Этап 1 пивота на B2B SaaS: атомарные RPC mark_shipper_payout_paid / cancel_shipper_payout
-- для таблицы shipper_payout_periods (существует с 20260417000008_shipper_ledger_payouts.sql).
--
-- Аналог старых seller-payout RPC (20260420000001), адаптированный под отправщиков.
-- Старые seller-RPC удаляются в миграции 20260423000002.

-- 1. mark_shipper_payout_paid: атомарный UPDATE + INSERT debit_payout
CREATE OR REPLACE FUNCTION public.mark_shipper_payout_paid(
  p_payout_id UUID,
  p_paid_by UUID,
  p_note TEXT DEFAULT NULL
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_shipper_id UUID;
  v_sum NUMERIC(12,2);
BEGIN
  UPDATE public.shipper_payout_periods
     SET status = 'paid',
         paid_at = NOW(),
         paid_by = p_paid_by,
         note = COALESCE(p_note, note)
   WHERE id = p_payout_id
     AND status = 'pending'
  RETURNING shipper_id INTO v_shipper_id;

  IF v_shipper_id IS NULL THEN
    RAISE EXCEPTION 'Shipper payout % not found or not pending', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Подсчёт суммы привязанных credit-записей и создание одной debit_payout записи
  SELECT COALESCE(SUM(amount), 0) INTO v_sum
    FROM public.shipper_ledger_entries
   WHERE ref_payout_id = p_payout_id
     AND kind = 'credit';

  IF v_sum > 0 THEN
    INSERT INTO public.shipper_ledger_entries
      (shipper_id, order_id, kind, amount, ref_payout_id)
    VALUES
      (v_shipper_id, NULL, 'debit_payout', v_sum, p_payout_id);
  END IF;
END $$;

-- 2. cancel_shipper_payout: атомарный UPDATE + UNLINK credits
CREATE OR REPLACE FUNCTION public.cancel_shipper_payout(
  p_payout_id UUID
) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_found UUID;
BEGIN
  UPDATE public.shipper_payout_periods
     SET status = 'cancelled'
   WHERE id = p_payout_id
     AND status = 'pending'
  RETURNING id INTO v_found;

  IF v_found IS NULL THEN
    RAISE EXCEPTION 'Shipper payout % not found or not pending', p_payout_id
      USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.shipper_ledger_entries
     SET ref_payout_id = NULL
   WHERE ref_payout_id = p_payout_id
     AND kind = 'credit';
END $$;

-- 3. shipper_ledger_entries: разрешить order_id NULL для debit_payout
-- (аналог seller_ledger_entries, мигр. 20260420000001).
-- Только если constraint/not-null ещё на месте.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'shipper_ledger_entries'
      AND column_name = 'order_id'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.shipper_ledger_entries ALTER COLUMN order_id DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE public.shipper_ledger_entries
  DROP CONSTRAINT IF EXISTS shipper_ledger_order_id_required;

ALTER TABLE public.shipper_ledger_entries
  ADD CONSTRAINT shipper_ledger_order_id_required
  CHECK (kind = 'debit_payout' OR order_id IS NOT NULL);

-- Расширить CHECK kind чтобы включить 'debit_payout' (было только 'credit')
-- Старый CHECK был: kind IN ('credit'). Добавляем 'debit_payout'.
ALTER TABLE public.shipper_ledger_entries
  DROP CONSTRAINT IF EXISTS shipper_ledger_entries_kind_check;

ALTER TABLE public.shipper_ledger_entries
  ADD CONSTRAINT shipper_ledger_entries_kind_check
  CHECK (kind IN ('credit', 'debit_payout'));

-- 4. GRANT
GRANT EXECUTE ON FUNCTION public.mark_shipper_payout_paid(UUID, UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_shipper_payout(UUID) TO service_role;

COMMENT ON FUNCTION public.mark_shipper_payout_paid IS
  'Атомарно переводит pending-выплату отправщику в paid и создаёт одну агрегированную debit_payout запись (order_id=NULL, amount=SUM credits). Raises P0002 если выплата не pending.';
COMMENT ON FUNCTION public.cancel_shipper_payout IS
  'Атомарно отменяет pending-выплату отправщику и возвращает привязанные credit-записи в доступный пул (ref_payout_id=NULL). Raises P0002 если выплата не pending.';

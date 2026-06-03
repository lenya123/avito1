-- Polish (B5): payable_amount не может быть отрицательным
-- Если net + clawback < 0, остаток переносится в новый adjustment (applied_to=NULL) для следующего периода

-- 1. Safety-update на случай существующих отрицательных записей (до CHECK)
UPDATE public.seller_payouts SET payable_amount = 0 WHERE payable_amount < 0;

-- 2. CHECK constraint
ALTER TABLE public.seller_payouts
  ADD CONSTRAINT seller_payouts_payable_non_negative
  CHECK (payable_amount >= 0);

-- 3. Пересборка build_seller_payouts_for_period с carryover
CREATE OR REPLACE FUNCTION public.build_seller_payouts_for_period(
  p_period_start DATE,
  p_period_end DATE
) RETURNS TABLE (out_seller_id UUID, out_payout_id UUID, out_payable NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_payout_id UUID;
  v_clawback NUMERIC(12,2);
  v_raw_payable NUMERIC(12,2);
  v_payable NUMERIC(12,2);
BEGIN
  FOR r IN
    SELECT
      sle.seller_id,
      SUM(o.client_price) AS gross,
      SUM(o.platform_fee_amount) AS commission,
      SUM(COALESCE(o.shipper_rate_snapshot, 0)) AS shipper,
      SUM(sle.amount) AS net,
      COUNT(*) AS orders_count
    FROM public.seller_ledger_entries sle
    JOIN public.orders o ON o.id = sle.order_id
    WHERE sle.kind = 'credit'
      AND sle.ref_payout_id IS NULL
      AND o.completed_at::DATE BETWEEN p_period_start AND p_period_end
    GROUP BY sle.seller_id
  LOOP
    SELECT COALESCE(SUM(amount), 0) INTO v_clawback
      FROM public.seller_payout_adjustments
      WHERE seller_id = r.seller_id AND applied_to_payout_id IS NULL;

    v_raw_payable := r.net + v_clawback;
    v_payable := GREATEST(0, v_raw_payable);

    INSERT INTO public.seller_payouts (
      seller_id, period_start, period_end,
      gross_amount, commission_amount, shipper_amount,
      clawback_amount, net_amount, payable_amount, orders_count
    ) VALUES (
      r.seller_id, p_period_start, p_period_end,
      r.gross, r.commission, r.shipper,
      ABS(v_clawback), r.net, v_payable, r.orders_count
    )
    ON CONFLICT (seller_id, period_start, period_end) DO NOTHING
    RETURNING id INTO v_payout_id;

    IF v_payout_id IS NOT NULL THEN
      UPDATE public.seller_ledger_entries
        SET ref_payout_id = v_payout_id
        WHERE seller_id = r.seller_id
          AND kind = 'credit'
          AND ref_payout_id IS NULL
          AND order_id IN (
            SELECT id FROM public.orders
            WHERE completed_at::DATE BETWEEN p_period_start AND p_period_end
          );

      INSERT INTO public.seller_payout_items (
        payout_id, order_id, ledger_entry_id,
        gross_amount, commission_amount, shipper_amount, net_amount
      )
      SELECT
        v_payout_id, o.id, sle.id,
        o.client_price, o.platform_fee_amount,
        COALESCE(o.shipper_rate_snapshot, 0), sle.amount
      FROM public.seller_ledger_entries sle
      JOIN public.orders o ON o.id = sle.order_id
      WHERE sle.ref_payout_id = v_payout_id AND sle.kind = 'credit';

      -- Применить текущие pending adjustments к этому payout
      UPDATE public.seller_payout_adjustments
        SET applied_to_payout_id = v_payout_id
        WHERE seller_id = r.seller_id AND applied_to_payout_id IS NULL;

      -- Carryover: если clawback поглотил весь net и осталось — создать новый adjustment на следующий период
      IF v_raw_payable < 0 THEN
        INSERT INTO public.seller_payout_adjustments (
          seller_id, amount, reason, source_payout_id, applied_to_payout_id
        ) VALUES (
          r.seller_id, v_raw_payable, 'clawback carryover', v_payout_id, NULL
        );
      END IF;

      out_seller_id := r.seller_id;
      out_payout_id := v_payout_id;
      out_payable := v_payable;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

COMMENT ON FUNCTION public.build_seller_payouts_for_period IS
  'Идемпотентная сборка seller payouts за период. payable_amount = GREATEST(0, net+clawback). При clawback > net остаток переносится в новый adjustment с applied_to=NULL.';

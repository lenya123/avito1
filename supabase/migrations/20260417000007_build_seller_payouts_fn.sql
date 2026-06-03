-- M5: Атомарная Postgres-функция для идемпотентной сборки seller payouts за период
-- Вызывается из BullMQ handler или вручную через API owner/payouts/generate

CREATE OR REPLACE FUNCTION public.build_seller_payouts_for_period(
  p_period_start DATE,
  p_period_end DATE
) RETURNS TABLE (out_seller_id UUID, out_payout_id UUID, out_payable NUMERIC)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  r RECORD;
  v_payout_id UUID;
  v_clawback NUMERIC(12,2);
BEGIN
  -- Для каждого селлера с непривязанными credit entries за период
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
    -- Подобрать pending adjustments (clawback после paid payout)
    SELECT COALESCE(SUM(amount), 0) INTO v_clawback
      FROM public.seller_payout_adjustments
      WHERE seller_id = r.seller_id AND applied_to_payout_id IS NULL;

    -- Создать payout (UNIQUE защищает от дубликатов → идемпотентно)
    INSERT INTO public.seller_payouts (
      seller_id, period_start, period_end,
      gross_amount, commission_amount, shipper_amount,
      clawback_amount, net_amount, payable_amount, orders_count
    ) VALUES (
      r.seller_id, p_period_start, p_period_end,
      r.gross, r.commission, r.shipper,
      ABS(v_clawback), r.net, r.net + v_clawback, r.orders_count
    )
    ON CONFLICT (seller_id, period_start, period_end) DO NOTHING
    RETURNING id INTO v_payout_id;

    -- Если payout создан (не дубликат)
    IF v_payout_id IS NOT NULL THEN
      -- Привязать ledger entries к этому payout
      UPDATE public.seller_ledger_entries
        SET ref_payout_id = v_payout_id
        WHERE seller_id = r.seller_id
          AND kind = 'credit'
          AND ref_payout_id IS NULL
          AND order_id IN (
            SELECT id FROM public.orders
            WHERE completed_at::DATE BETWEEN p_period_start AND p_period_end
          );

      -- Вставить items (детализация по заказам)
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

      -- Применить pending adjustments
      UPDATE public.seller_payout_adjustments
        SET applied_to_payout_id = v_payout_id
        WHERE seller_id = r.seller_id AND applied_to_payout_id IS NULL;

      -- Вернуть результат
      out_seller_id := r.seller_id;
      out_payout_id := v_payout_id;
      out_payable := r.net + v_clawback;
      RETURN NEXT;
    END IF;
  END LOOP;
END $$;

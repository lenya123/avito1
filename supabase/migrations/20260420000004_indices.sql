-- Polish (P1 #9): индексы на JOIN-колонки + partial index под будущий ЮKassa webhook

-- seller_payout_items.payout_id — постоянный JOIN в /owner/payouts, /seller/finance
CREATE INDEX IF NOT EXISTS seller_payout_items_payout_id_idx
  ON public.seller_payout_items(payout_id);

-- orders.yookassa_deal_id — partial index под Phase 4 webhook
CREATE INDEX IF NOT EXISTS orders_yookassa_deal_id_idx
  ON public.orders(yookassa_deal_id)
  WHERE yookassa_deal_id IS NOT NULL;

-- seller_ledger_entries.ref_payout_id — индекс уже существует как seller_ledger_payout_ref_idx
-- (создан в 20260417000005_seller_ledger.sql).

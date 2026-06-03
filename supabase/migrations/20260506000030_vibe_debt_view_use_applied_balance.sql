-- View customer_vibe_debt: учитывать applied_balance.
-- Долг = сумма (client_price - applied_balance) по неоплаченным +ВАЙБ-заказам.
-- Раньше считалось по полной client_price → клиент переплачивал и лимит
-- съедался лишним в случае частичной оплаты с баланса.

CREATE OR REPLACE VIEW public.customer_vibe_debt AS
SELECT
  c.id AS customer_id,
  COALESCE(SUM(o.client_price - COALESCE(o.applied_balance, 0)), 0)::NUMERIC(12, 2) AS debt
FROM public.customers c
LEFT JOIN public.orders o
  ON o.customer_id = c.id
  AND o.is_paid = FALSE
  AND o.payment_method = 'deposit'
  AND o.status NOT IN ('cancelled', 'trash', 'return_done')
GROUP BY c.id;

GRANT SELECT ON public.customer_vibe_debt TO authenticated;

-- Phase G.1 — partners.payment_requisites + partner_commission_paid_at + view долгов.
--
-- BUSINESS_LOGIC §10.4-§10.5: клиент платит партнёру напрямую по статичным
-- реквизитам, хранящимся в partners.payment_requisites. partner-request-
-- requisites job упрощается / уходит — реквизиты не запрашиваются в реальном
-- времени, владелец вносит их при добавлении партнёра.
--
-- Также:
--   - orders.partner_commission_paid_at — дата фактического получения
--     комиссии владельцем (NULL → партнёр ещё должен по этому заказу).
--   - View partner_commission_debt — текущий долг каждого партнёра.

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS payment_requisites TEXT;

COMMENT ON COLUMN public.partners.payment_requisites IS
  'Реквизиты партнёра для прямой оплаты клиентом (BUSINESS_LOGIC §7.2). HTML-разметка допустима. Подставляется в wizard заказа вместо реквизитов владельца. Владелец редактирует в /owner/partners.';

-- Колонка на orders для отметки оплаченной комиссии партнёром.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_commission_paid_at TIMESTAMPTZ;

COMMENT ON COLUMN public.orders.partner_commission_paid_at IS
  'BUSINESS_LOGIC §10.4: timestamp когда партнёр перевёл комиссию владельцу. NULL — комиссия числится как долг партнёра.';

CREATE INDEX IF NOT EXISTS idx_orders_partner_commission_unpaid
  ON public.orders(partner_id)
  WHERE partner_commission_paid_at IS NULL
    AND partner_id IS NOT NULL
    AND partner_commission_snapshot IS NOT NULL;

-- View: сумма неоплаченных комиссий по каждому партнёру.
CREATE OR REPLACE VIEW public.partner_commission_debt AS
SELECT
  p.id AS partner_id,
  p.name AS partner_name,
  COALESCE(SUM(o.partner_commission_snapshot), 0)::NUMERIC(12, 2) AS debt,
  COUNT(o.id)::INT AS unpaid_orders_count
FROM public.partners p
LEFT JOIN public.orders o
  ON o.partner_id = p.id
  AND o.status = 'sent'
  AND o.partner_commission_paid_at IS NULL
  AND o.partner_commission_snapshot IS NOT NULL
GROUP BY p.id, p.name;

GRANT SELECT ON public.partner_commission_debt TO authenticated;

COMMENT ON VIEW public.partner_commission_debt IS
  'BUSINESS_LOGIC §10.4: текущий долг партнёра по комиссиям. Учитываются только заказы в статусе sent с непогашенной комиссией.';

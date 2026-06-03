-- Walkthrough фазы 2 пробел C: разбивка +ВАЙБ-долга клиента по
-- адресатам (получателям денег). Контекст: общий debt считается
-- view'ом customer_vibe_debt — это сумма всех неоплаченных открытых
-- заказов. На странице клиента владелец хочет видеть не только сумму,
-- но и кому конкретно клиент должен:
--   - «свой склад» (partner_id IS NULL) — деньги пойдут владельцу;
--   - каждый партнёр отдельно (partner_id = X) — деньги ему по канону
--     «партнёрский заказ → деньги партнёру».
--
-- RPC возвращает по одной строке на каждого адресата с долгом > 0,
-- отсортированной по сумме DESC. partner_id и partner_name NULL для
-- строки «свой склад».

CREATE OR REPLACE FUNCTION public.get_customer_debt_by_recipient(p_customer_id UUID)
RETURNS TABLE (
  recipient_type TEXT,
  partner_id UUID,
  partner_name TEXT,
  debt NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    CASE WHEN o.partner_id IS NULL THEN 'owner'::TEXT ELSE 'partner'::TEXT END AS recipient_type,
    o.partner_id,
    p.name AS partner_name,
    SUM(o.client_price)::NUMERIC(12, 2) AS debt
  FROM public.orders o
  LEFT JOIN public.partners p ON p.id = o.partner_id
  WHERE o.customer_id = p_customer_id
    AND o.is_paid = FALSE
    AND o.status NOT IN ('cancelled', 'disposed', 'trash', 'return_completed')
  GROUP BY o.partner_id, p.name
  HAVING SUM(o.client_price) > 0
  ORDER BY debt DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_customer_debt_by_recipient(UUID) TO service_role;

COMMENT ON FUNCTION public.get_customer_debt_by_recipient IS
  'Walkthrough фазы 2: разбивка +ВАЙБ-долга клиента по адресатам (свой склад / каждый партнёр). Используется в /owner/clients/[id] для блока «По кому должен». Общая сумма совпадает с customer_vibe_debt.debt — это та же выборка, но не агрегированная в одну строку.';

-- Audit view: инвариант customer_balance == SUM(customer_balance_history.delta).
-- Если когда-нибудь нарушится — показывает customer_id и расхождение.
-- Возвращает только клиентов с расхождением; если view пустой — всё чисто.
--
-- Использование: SELECT * FROM customer_balance_integrity_view;
--   из SQL Studio для ручного аудита.
CREATE OR REPLACE VIEW public.customer_balance_integrity_view AS
SELECT
  c.id AS customer_id,
  c.customer_balance AS current_balance,
  COALESCE(SUM(h.delta), 0) AS history_sum,
  c.customer_balance - COALESCE(SUM(h.delta), 0) AS drift
FROM public.customers c
LEFT JOIN public.customer_balance_history h ON h.customer_id = c.id
GROUP BY c.id, c.customer_balance
HAVING c.customer_balance <> COALESCE(SUM(h.delta), 0);

GRANT SELECT ON public.customer_balance_integrity_view TO authenticated;

COMMENT ON VIEW public.customer_balance_integrity_view IS
  'Audit-инвариант: текущий customer_balance должен равняться сумме delta в customer_balance_history. Пустой view = всё чисто.';

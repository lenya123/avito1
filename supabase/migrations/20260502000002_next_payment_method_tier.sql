-- next_payment_method: ступенчатая ротация + pro-rata.
--   1. tier ASC (1 → 2 → 3).
--   2. Внутри ступени — ratio_used ASC: amount_used_this_month / monthly_limit.
--      Карты без лимита получают ratio=0 (всегда «свободны»).
--   3. id ASC — детерминированный tie-breaker.
-- Месячный лимит фильтрует: метод с исчерпанным лимитом игнорируется.

CREATE OR REPLACE FUNCTION public.next_payment_method(p_amount NUMERIC)
RETURNS SETOF public.payment_methods
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.*
  FROM public.payment_methods pm
  LEFT JOIN public.payment_method_month_stats st
    ON st.payment_method_id = pm.id
    AND st.year_month = to_char(NOW(), 'YYYY-MM')
  WHERE pm.is_active = TRUE
    AND (pm.monthly_limit IS NULL
         OR COALESCE(st.amount_used, 0) + p_amount <= pm.monthly_limit)
  ORDER BY
    pm.tier ASC,
    CASE
      WHEN pm.monthly_limit IS NULL OR pm.monthly_limit = 0 THEN 0
      ELSE COALESCE(st.amount_used, 0) / pm.monthly_limit
    END ASC,
    pm.id ASC
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.next_payment_method IS
  'Возвращает следующий активный метод. Сортировка: tier ASC → ratio_used ASC (pro-rata по лимиту) → id. Между ступенями — строгий fallback по исчерпанию лимита.';

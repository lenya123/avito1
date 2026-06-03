-- Заморозка по-новому: снимок долга на момент заморозки + порог «оплатить
-- больше чем». Условие разморозки:
--   (frozen_debt_snapshot - current_debt) >= required_payment_amount
--
-- То есть: на момент заморозки долг был X, владелец требует погасить N
-- (любыми заказами), и когда долг упадёт ниже (X - N) — авто-разморозка.
--
-- Backfill для уже замороженных клиентов: snapshot = текущий долг.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS frozen_debt_snapshot NUMERIC(12, 2);

COMMENT ON COLUMN public.customers.frozen_debt_snapshot IS
  'Долг на момент заморозки. Используется триггером check_vibe_credit_freeze для условия "оплатил больше чем required_payment_amount" (при текущем долге < snapshot - required размораживаем).';

UPDATE public.customers c
   SET frozen_debt_snapshot = COALESCE(
     (SELECT debt FROM public.customer_vibe_debt WHERE customer_id = c.id),
     0
   )
 WHERE c.is_frozen = TRUE
   AND c.frozen_debt_snapshot IS NULL;

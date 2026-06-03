-- Расширяем CHECK на customer_balance_history.reason под новые движения
-- из walkthrough Этапов 1, 2, 3:
--   overpayment_credit  — Vision auto-confirm с переплатой → излишек на баланс
--   mismatch_credit     — директор «Сумма не совпала» → деньги на баланс
--   balance_apply       — баланс списан при оформлении заказа (Этап 3)
--   balance_return      — возврат баланса при cancel/expire pending (Этап 3)

ALTER TABLE public.customer_balance_history
  DROP CONSTRAINT IF EXISTS customer_balance_history_reason_check;

ALTER TABLE public.customer_balance_history
  ADD CONSTRAINT customer_balance_history_reason_check
  CHECK (reason IN (
    'return_done',
    'cancelled_before_ship',
    'send_by_expired',
    'manual_credit',
    'withdrawal',
    'overpayment_credit',
    'mismatch_credit',
    'balance_apply',
    'balance_return'
  ));

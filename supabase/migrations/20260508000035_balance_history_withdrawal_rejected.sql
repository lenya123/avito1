-- Расширяем CHECK reason: добавляем 'withdrawal_rejected' для случая
-- «N нет» — владелец отказал в выводе и вернул деньги клиенту на баланс.
-- Отличается от 'withdrawal_cancel' (клиент отменил сам).
ALTER TABLE public.customer_balance_history
  DROP CONSTRAINT IF EXISTS customer_balance_history_reason_check,
  ADD CONSTRAINT customer_balance_history_reason_check CHECK (reason IN (
    'return_done',
    'cancelled_before_ship',
    'send_by_expired',
    'manual_credit',
    'withdrawal',
    'withdrawal_request',
    'withdrawal_cancel',
    'withdrawal_rejected',
    'overpayment_credit',
    'mismatch_credit',
    'balance_apply',
    'balance_return',
    'partner_refund_credit'
  ));

-- Walkthrough #5: расширяем CHECK reason на customer_balance_history под
-- новые движения (резервирование при создании запроса, возврат при отмене).
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
    'overpayment_credit',
    'mismatch_credit',
    'balance_apply',
    'balance_return',
    'partner_refund_credit'
  ));

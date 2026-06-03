-- Walkthrough фазы 2 (/owner/clients/[id]): добавляем reason
-- `manual_debit` для ручного списания владельцем с customer_balance
-- через ➖ кнопку. Зеркало к существующему `manual_credit` (➕).
ALTER TABLE public.customer_balance_history
  DROP CONSTRAINT IF EXISTS customer_balance_history_reason_check,
  ADD CONSTRAINT customer_balance_history_reason_check CHECK (reason IN (
    'return_done',
    'cancelled_before_ship',
    'send_by_expired',
    'manual_credit',
    'manual_debit',
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

-- Расширение reason CHECK на customer_balance_history: добавляется partner_refund_credit
-- — credit клиенту когда партнёр сказал «деньги пришли но размер/товар закончился».

ALTER TABLE public.customer_balance_history
  DROP CONSTRAINT IF EXISTS customer_balance_history_reason_check;

ALTER TABLE public.customer_balance_history
  ADD CONSTRAINT customer_balance_history_reason_check CHECK (reason IN (
    'return_done','cancelled_before_ship','send_by_expired','manual_credit',
    'withdrawal','overpayment_credit','mismatch_credit','balance_apply',
    'balance_return','partner_refund_credit'
  ));

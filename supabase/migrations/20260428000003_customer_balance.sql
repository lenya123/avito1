-- Phase A.3 — customers.customer_balance: накопительный баланс «владелец должен клиенту».
--
-- BUSINESS_LOGIC §9.2: пополняется автоматически при return_done / cancelled до отправки /
-- send_by сгорел (если заказ был оплачен), а также вручную владельцем.
-- Списывается при выводе денег клиенту (withdrawal_requests).
--
-- Сама механика наполнения/списания + история движений — Phase F (триггер +
-- кнопка «Запросить вывод»). Здесь только колонка-фундамент.

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS customer_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.customers
  DROP CONSTRAINT IF EXISTS customers_balance_non_negative;
ALTER TABLE public.customers
  ADD CONSTRAINT customers_balance_non_negative
  CHECK (customer_balance >= 0);

CREATE INDEX IF NOT EXISTS idx_customers_balance_positive
  ON public.customers(customer_balance)
  WHERE customer_balance > 0;

COMMENT ON COLUMN public.customers.customer_balance IS
  'Накопительный баланс «владелец должен клиенту» (BUSINESS_LOGIC §9.2). Пополняется автоматически при return_done / cancelled / send_by-сгорел; списывается при выводе через withdrawal_requests. История движений — customer_balance_history.';

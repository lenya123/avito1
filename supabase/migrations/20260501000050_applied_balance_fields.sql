-- Этап 3 walkthrough: применение баланса клиента при оформлении заказа.
-- pending_orders.applied_balance — сколько списано с баланса при создании
-- pending'а. orders.applied_balance копируется при confirm.
--
-- Логика:
--   wizard finalize → create_pending_order_atomic списывает balance_to_apply =
--     min(customer.customer_balance, client_price), пишет в applied_balance,
--     уменьшает customer_balance, history reason='balance_apply'.
--   Если applied_balance == client_price → flow «оплачено полностью с баланса»,
--     pending немедленно confirm'ается без чека (см. customer-bot finalize).
--   recognize-pending-receipt и director считают ожидаемую сумму как
--     (client_price - applied_balance) — клиент платит остаток.
--   При cancel/expire pending → applied_balance возвращается на баланс
--     (reason='balance_return').

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS applied_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS applied_balance NUMERIC(12, 2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.pending_orders.applied_balance IS
  'Сколько ₽ списано с customers.customer_balance при создании pending. К оплате остаётся client_price - applied_balance.';
COMMENT ON COLUMN public.orders.applied_balance IS
  'Сколько ₽ оплачено заказа из баланса клиента (применено при оформлении). Копируется из pending при confirm.';

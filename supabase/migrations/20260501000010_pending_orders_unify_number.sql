-- Унифицируем нумерацию: pending_orders берут номер из той же sequence
-- что и orders. При confirm_pending_order_atomic номер копируется из
-- pending в orders — то есть «номер заказа» един на всём жизненном цикле.

ALTER TABLE public.pending_orders DROP CONSTRAINT IF EXISTS pending_orders_pending_number_unique;
ALTER TABLE public.pending_orders DROP COLUMN IF EXISTS pending_number;
DROP SEQUENCE IF EXISTS public.pending_orders_number_seq;

ALTER TABLE public.pending_orders
  ADD COLUMN order_number INTEGER NOT NULL DEFAULT nextval('orders_order_number_seq');

ALTER TABLE public.pending_orders
  ADD CONSTRAINT pending_orders_order_number_unique UNIQUE (order_number);

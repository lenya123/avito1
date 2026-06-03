-- Добавляем человекочитаемый номер pending_orders для текстового
-- подтверждения партнёром «N да/нет» (как у orders.order_number).
-- Идём с собственной sequence чтобы не пересекаться с orders.order_number.

CREATE SEQUENCE IF NOT EXISTS public.pending_orders_number_seq;

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS pending_number BIGINT
    NOT NULL DEFAULT nextval('public.pending_orders_number_seq');

ALTER TABLE public.pending_orders
  ADD CONSTRAINT pending_orders_pending_number_unique UNIQUE (pending_number);

ALTER SEQUENCE public.pending_orders_number_seq OWNED BY public.pending_orders.pending_number;

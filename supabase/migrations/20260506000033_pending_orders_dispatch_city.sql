-- Snapshot города отправки в pending_orders (нужен для confirm_pending).

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS dispatch_city TEXT;

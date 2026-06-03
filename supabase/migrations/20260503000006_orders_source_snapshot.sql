-- Snapshot источника на orders: копируется из pending_orders при confirm_pending_order_atomic.

ALTER TABLE public.orders
  ADD COLUMN source_kind       TEXT NULL CHECK (source_kind IN ('owner','partner')),
  ADD COLUMN source_binding_id UUID NULL REFERENCES public.product_partner_bindings(id),
  ADD COLUMN source_partner_id UUID NULL REFERENCES public.partners(id),
  ADD COLUMN source_warehouse  TEXT NULL CHECK (source_warehouse IN ('owner','partner'));

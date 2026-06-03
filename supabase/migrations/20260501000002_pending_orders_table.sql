-- §4.1 переход на 🅐: для не-+ВАЙБ клиентов запись в `orders` появляется
-- ТОЛЬКО после подтверждения оплаты. До этого — `pending_orders`.
--
-- +ВАЙБ-клиенты работают в долг: для них orders row создаётся как раньше
-- сразу при wizard'е (status='paid', is_paid=false).

CREATE TABLE IF NOT EXISTS public.pending_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_size_id UUID NOT NULL REFERENCES public.product_sizes(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.partners(id) ON DELETE SET NULL,
  client_price NUMERIC(12, 2) NOT NULL,
  delivery_service VARCHAR(50) NOT NULL,
  tracking_number VARCHAR(100) NOT NULL,
  send_by DATE NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  receipt_storage_path TEXT,
  receipt_file_id TEXT,
  receipt_received_at TIMESTAMPTZ,
  partner_payment_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pending_orders_customer ON public.pending_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_pending_orders_partner ON public.pending_orders(partner_id) WHERE partner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pending_orders_expires ON public.pending_orders(expires_at);
CREATE INDEX IF NOT EXISTS idx_pending_orders_size ON public.pending_orders(product_size_id);

ALTER TABLE public.pending_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY pending_orders_owner_all ON public.pending_orders
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

REVOKE ALL ON public.pending_orders FROM anon;

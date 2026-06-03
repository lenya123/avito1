-- RLS-policies на новые таблицы. Шаблон из существующих policies на payment_methods —
-- public.is_owner() даёт доступ авторизованному owner-пользователю; service-role обходит RLS.

ALTER TABLE public.product_partner_bindings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_partner_size_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.partner_owner_debts        ENABLE ROW LEVEL SECURITY;

CREATE POLICY product_partner_bindings_owner_all ON public.product_partner_bindings
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY product_partner_size_stock_owner_all ON public.product_partner_size_stock
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY partner_owner_debts_owner_all ON public.partner_owner_debts
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

REVOKE ALL ON public.product_partner_bindings   FROM anon;
REVOKE ALL ON public.product_partner_size_stock FROM anon;
REVOKE ALL ON public.partner_owner_debts        FROM anon;

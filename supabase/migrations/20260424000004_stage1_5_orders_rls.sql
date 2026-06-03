-- Этап 1.5 — возвращаем orders SELECT RLS.
--
-- Контекст: 20260414000004 переопределил orders_select через is_seller().
-- stage1 (20260423000002) каскадно удалил is_seller() → с ним ушла и политика.
-- После stage1 у orders нет SELECT-политики; PWA отправщика на authenticated
-- контексте не увидит заказы. В prod сейчас спасает service_role, но это
-- мина на будущее.
--
-- Восстанавливаем:
--   - owner/admin видят все заказы
--   - shipper видит заказы только в статусах сборки/доставки/возврата
--
-- (В Stage 2 orders.client_id заменится на FK к customers и RLS станет
--  ещё проще; customer-bot всё равно ходит через service_role.)

DROP POLICY IF EXISTS orders_select ON public.orders;

CREATE POLICY orders_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.is_owner()
    OR (
      public.is_shipper() AND status IN (
        'awaiting_shipment',
        'collecting',
        'in_transit',
        'return_in_transit',
        'return_arrived'
      )
    )
  );

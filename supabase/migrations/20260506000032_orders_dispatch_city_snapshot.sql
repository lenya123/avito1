-- Snapshot города отправки в orders. Раньше нигде не хранился, при показе
-- карточки заказа город отгрузки приходилось JOIN'ить через partners или
-- выводить products.location_city (=город владельца, неточно для
-- partner_warehouse). Snapshot фиксирует city на момент confirm_pending.

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS dispatch_city TEXT;

-- Backfill для существующих заказов: для partner_warehouse — из
-- partners.warehouse_city, иначе из products.location_city.
UPDATE public.orders o
   SET dispatch_city = p.warehouse_city
  FROM public.partners p
 WHERE o.source_partner_id = p.id
   AND o.source_warehouse = 'partner'
   AND o.dispatch_city IS NULL;

UPDATE public.orders o
   SET dispatch_city = pr.location_city
  FROM public.products pr
 WHERE o.product_id = pr.id
   AND o.dispatch_city IS NULL
   AND pr.location_city IS NOT NULL;

COMMENT ON COLUMN public.orders.dispatch_city IS
  'Город отправки на момент создания заказа (snapshot). Для partner_warehouse — из partners.warehouse_city, иначе products.location_city.';

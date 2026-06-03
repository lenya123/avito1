-- Backfill orders.size для всех заказов где size IS NULL — берём из
-- product_sizes по product_size_id. Закрывает накопившийся gap: новые
-- orders создавались через confirm_pending_order_atomic v5-v12, которые
-- НЕ копировали size в orders.size — shipper-PWA каждый раз думал
-- что размер не выбран.

UPDATE public.orders o
   SET size = ps.size
  FROM public.product_sizes ps
 WHERE o.size IS NULL
   AND o.product_size_id = ps.id;

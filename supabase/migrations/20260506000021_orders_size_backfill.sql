-- Backfill orders.size для заказов где size остался NULL после v14/v15
-- (мы случайно не копировали колонку — фикс в v16). Берём size из
-- product_sizes по product_size_id.

UPDATE public.orders o
   SET size = ps.size
  FROM public.product_sizes ps
 WHERE o.product_size_id = ps.id
   AND o.size IS NULL;

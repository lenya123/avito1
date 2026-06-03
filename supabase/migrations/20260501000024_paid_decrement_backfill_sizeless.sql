-- Симметрия учёта склада, часть 4b/5: backfill размер-less товаров.
-- Активные orders без product_size_id (не manual) — DEC current и reserved
-- на уровне products.

UPDATE public.products p
   SET current_quantity = GREATEST(COALESCE(p.current_quantity, 0) - a.cnt, 0),
       reserved_quantity = GREATEST(COALESCE(p.reserved_quantity, 0) - a.cnt, 0)
  FROM (
    SELECT product_id, COUNT(*)::INT AS cnt
      FROM public.orders
     WHERE status IN ('paid', 'collecting', 'printed', 'problem')
       AND COALESCE(source, '') <> 'manual'
       AND product_size_id IS NULL
       AND product_id IS NOT NULL
     GROUP BY product_id
  ) a
 WHERE p.id = a.product_id;

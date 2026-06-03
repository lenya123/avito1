-- Симметрия учёта склада, часть 4a/5: backfill размеров.
-- Активные orders с product_size_id (не manual) — DEC current и reserved.

UPDATE public.product_sizes ps
   SET current_quantity = GREATEST(COALESCE(ps.current_quantity, 0) - a.cnt, 0),
       reserved_quantity = GREATEST(COALESCE(ps.reserved_quantity, 0) - a.cnt, 0)
  FROM (
    SELECT product_size_id, COUNT(*)::INT AS cnt
      FROM public.orders
     WHERE status IN ('paid', 'collecting', 'printed', 'problem')
       AND COALESCE(source, '') <> 'manual'
       AND product_size_id IS NOT NULL
     GROUP BY product_size_id
  ) a
 WHERE ps.id = a.product_size_id;

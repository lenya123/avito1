-- select_size_source: для (product_id, size) возвращает первый по лестнице источник
-- с положительным свободным остатком. Сначала владелец (product_sizes), затем — партнёрские
-- привязки (product_partner_bindings + product_partner_size_stock) в порядке priority.
-- Фильтр: партнёр активен; для partner_warehouse-привязок — payment_requisites IS NOT NULL.
--
-- STABLE без FOR UPDATE — это «прицеливание». Финальная блокировка делается в
-- reserve_size_atomic / create_pending_order_atomic (FOR UPDATE на конкретной строке стока).

CREATE OR REPLACE FUNCTION public.select_size_source(
  p_product_id UUID,
  p_size TEXT
)
RETURNS TABLE (
  source_kind       TEXT,
  source_binding_id UUID,
  source_partner_id UUID,
  source_warehouse  TEXT,
  available         INTEGER
)
LANGUAGE plpgsql
STABLE
AS $func$
DECLARE
  v_owner_free INTEGER;
BEGIN
  SELECT GREATEST(0, COALESCE(ps.current_quantity, 0) - COALESCE(ps.reserved_quantity, 0))
    INTO v_owner_free
    FROM public.product_sizes ps
   WHERE ps.product_id = p_product_id
     AND ps.size = p_size
   LIMIT 1;

  IF v_owner_free IS NOT NULL AND v_owner_free > 0 THEN
    source_kind := 'owner';
    source_binding_id := NULL;
    source_partner_id := NULL;
    source_warehouse := 'owner';
    available := v_owner_free;
    RETURN NEXT;
    RETURN;
  END IF;

  RETURN QUERY
    SELECT
      'partner'::TEXT,
      b.id,
      b.partner_id,
      b.warehouse_kind,
      GREATEST(0, COALESCE(s.current_quantity, 0) - COALESCE(s.reserved_quantity, 0))
    FROM public.product_partner_bindings b
    JOIN public.product_partner_size_stock s
      ON s.binding_id = b.id AND s.size = p_size
    JOIN public.partners p ON p.id = b.partner_id
   WHERE b.product_id = p_product_id
     AND b.deleted_at IS NULL
     AND p.is_active = TRUE
     AND (b.warehouse_kind = 'owner' OR p.payment_requisites IS NOT NULL)
     AND COALESCE(s.current_quantity, 0) - COALESCE(s.reserved_quantity, 0) > 0
   ORDER BY b.priority ASC
   LIMIT 1;
END;
$func$;

GRANT EXECUTE ON FUNCTION public.select_size_source(UUID, TEXT) TO service_role, authenticated;

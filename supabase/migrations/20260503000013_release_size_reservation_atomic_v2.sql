-- release_size_reservation_atomic v2: source-aware. Читает source_kind/source_binding_id
-- из size_reservations и DEC reserved у правильной таблицы (product_sizes для owner,
-- product_partner_size_stock для partner).
--
-- Сигнатура без изменений — добавление логики совместимо со всеми вызывающими.

CREATE OR REPLACE FUNCTION public.release_size_reservation_atomic(
  p_product_size_id UUID,
  p_session_id      TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_reservation RECORD;
BEGIN
  SELECT id, source_kind, source_binding_id, size_text
    INTO v_reservation
    FROM public.size_reservations
   WHERE product_size_id = p_product_size_id
     AND session_id = p_session_id
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.size_reservations WHERE id = v_reservation.id;

  IF v_reservation.source_kind = 'partner'
     AND v_reservation.source_binding_id IS NOT NULL
     AND v_reservation.size_text IS NOT NULL
  THEN
    UPDATE public.product_partner_size_stock
       SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
     WHERE binding_id = v_reservation.source_binding_id
       AND size = v_reservation.size_text;
  ELSE
    UPDATE public.product_sizes
       SET reserved_quantity = GREATEST(COALESCE(reserved_quantity, 0) - 1, 0)
     WHERE id = p_product_size_id;
  END IF;

  RETURN TRUE;
END;
$func$;

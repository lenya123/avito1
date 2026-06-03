-- Регрессия в reserve_size_atomic v2 (миграция 20260503000012): INSERT писал
-- одновременно product_size_id и product_id, что нарушало chk_reservation_target
-- (требует РОВНО ОДНО из них, см. 20260220000001). v1-фикс 20260430000004 это
-- специально учитывал, при апгрейде на v2 правило потерялось — все тапы по
-- размеру в customer-bot падали с code 23514.
--
-- v3: в обеих ветках (owner/partner) пишем только product_size_id, product_id
-- оставляем NULL. release_size_reservation_atomic v2 ищет по product_size_id,
-- так что сигнатура и хранение совместимы.

CREATE OR REPLACE FUNCTION public.reserve_size_atomic(
  p_product_size_id   UUID,
  p_session_id        TEXT,
  p_ttl_minutes       INTEGER DEFAULT 5,
  p_source_kind       TEXT DEFAULT 'owner',
  p_source_binding_id UUID DEFAULT NULL,
  p_size              TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_current      INTEGER;
  v_reserved     INTEGER;
  v_existing_id  UUID;
  v_new_expires  TIMESTAMPTZ;
BEGIN
  v_new_expires := NOW() + make_interval(mins => p_ttl_minutes);

  IF p_source_kind = 'owner' THEN
    SELECT COALESCE(current_quantity, 0), COALESCE(reserved_quantity, 0)
      INTO v_current, v_reserved
      FROM public.product_sizes
     WHERE id = p_product_size_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_SIZE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO v_existing_id
      FROM public.size_reservations
     WHERE product_size_id = p_product_size_id
       AND session_id = p_session_id
       AND source_kind = 'owner'
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.size_reservations
         SET expires_at = v_new_expires
       WHERE id = v_existing_id;
      RETURN v_existing_id;
    END IF;

    IF v_current - v_reserved <= 0 THEN
      RAISE EXCEPTION 'OUT_OF_STOCK' USING ERRCODE = 'P0003';
    END IF;

    INSERT INTO public.size_reservations
      (product_size_id, product_id, session_id, expires_at, source_kind)
    VALUES
      (p_product_size_id, NULL, p_session_id, v_new_expires, 'owner')
    RETURNING id INTO v_existing_id;

    UPDATE public.product_sizes
       SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
     WHERE id = p_product_size_id;

    RETURN v_existing_id;

  ELSIF p_source_kind = 'partner' THEN
    IF p_source_binding_id IS NULL OR p_size IS NULL THEN
      RAISE EXCEPTION 'PARTNER_SOURCE_REQUIRES_BINDING_AND_SIZE' USING ERRCODE = 'P0001';
    END IF;

    SELECT COALESCE(current_quantity, 0), COALESCE(reserved_quantity, 0)
      INTO v_current, v_reserved
      FROM public.product_partner_size_stock
     WHERE binding_id = p_source_binding_id
       AND size = p_size
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PARTNER_SIZE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO v_existing_id
      FROM public.size_reservations
     WHERE source_binding_id = p_source_binding_id
       AND size_text = p_size
       AND session_id = p_session_id
       AND source_kind = 'partner'
     LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      UPDATE public.size_reservations
         SET expires_at = v_new_expires
       WHERE id = v_existing_id;
      RETURN v_existing_id;
    END IF;

    IF v_current - v_reserved <= 0 THEN
      RAISE EXCEPTION 'OUT_OF_STOCK' USING ERRCODE = 'P0003';
    END IF;

    INSERT INTO public.size_reservations
      (product_size_id, product_id, session_id, expires_at,
       source_kind, source_binding_id, size_text)
    VALUES
      (p_product_size_id, NULL, p_session_id, v_new_expires,
       'partner', p_source_binding_id, p_size)
    RETURNING id INTO v_existing_id;

    UPDATE public.product_partner_size_stock
       SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
     WHERE binding_id = p_source_binding_id
       AND size = p_size;

    RETURN v_existing_id;

  ELSE
    RAISE EXCEPTION 'INVALID_SOURCE_KIND: %', p_source_kind USING ERRCODE = 'P0001';
  END IF;
END;
$func$;

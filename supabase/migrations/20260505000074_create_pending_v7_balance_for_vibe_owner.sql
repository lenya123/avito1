-- create_pending_order_atomic v7: для +ВАЙБ-заказов с моего склада
-- сначала списываем баланс клиента, в долг уходит только остаток.
-- Раньше (v6): при is_vibe_debt=true баланс игнорировался — заказ целиком
-- шёл в долг даже если на балансе были деньги.
--
-- Логика:
--   - НЕ-+ВАЙБ + owner-source: баланс применяется (как раньше).
--   - +ВАЙБ + owner-source: баланс применяется (новое — экономит лимит).
--   - НЕ-+ВАЙБ + partner-source: баланс НЕ применяется (нельзя платить
--     партнёру с моего кармана).
--   - +ВАЙБ + partner-source: баланс НЕ применяется (та же причина).
--
-- Если баланса хватило на ВЕСЬ +ВАЙБ-заказ — всё равно is_vibe_debt
-- остаётся true, заказ instant-confirm'ится в Ветке 1 customer-bot
-- как «оплачен полностью с баланса». В долг ничего не пойдёт.

CREATE OR REPLACE FUNCTION public.create_pending_order_atomic(
  p_customer_id        UUID,
  p_product_id         UUID,
  p_product_size_id    UUID,
  p_client_price       NUMERIC,
  p_delivery_service   TEXT,
  p_tracking_number    TEXT,
  p_send_by            DATE,
  p_source_kind        TEXT,
  p_source_binding_id  UUID DEFAULT NULL,
  p_size               TEXT DEFAULT NULL,
  p_is_vibe_debt       BOOLEAN DEFAULT FALSE,
  p_ttl_minutes        INTEGER DEFAULT 10
)
RETURNS TABLE (
  pending_id            UUID,
  applied_balance       NUMERIC,
  fully_paid_by_balance BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_current             INTEGER;
  v_reserved            INTEGER;
  v_session_reservation UUID;
  v_pending_id          UUID;
  v_balance             NUMERIC;
  v_applied             NUMERIC := 0;
  v_remaining           NUMERIC;
  v_fully_paid          BOOLEAN := FALSE;
  v_now                 TIMESTAMPTZ := NOW();
  v_new_balance         NUMERIC;
  v_warehouse           TEXT;
  v_partner_id          UUID;
  v_expires_at          TIMESTAMPTZ;
BEGIN
  IF p_source_kind = 'owner' THEN
    v_warehouse  := 'owner';
    v_partner_id := NULL;

    SELECT COALESCE(current_quantity, 0), COALESCE(reserved_quantity, 0)
      INTO v_current, v_reserved
      FROM public.product_sizes
     WHERE id = p_product_size_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'PRODUCT_SIZE_NOT_FOUND' USING ERRCODE = 'P0002';
    END IF;

    SELECT id INTO v_session_reservation
      FROM public.size_reservations
     WHERE product_size_id = p_product_size_id
       AND session_id = p_customer_id::TEXT
       AND source_kind = 'owner'
     LIMIT 1;

    IF v_session_reservation IS NOT NULL THEN
      DELETE FROM public.size_reservations WHERE id = v_session_reservation;
    ELSE
      IF v_current - v_reserved <= 0 THEN
        RAISE EXCEPTION 'OUT_OF_STOCK' USING ERRCODE = 'P0003';
      END IF;
      UPDATE public.product_sizes
         SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
       WHERE id = p_product_size_id;
    END IF;

  ELSIF p_source_kind = 'partner' THEN
    IF p_source_binding_id IS NULL OR p_size IS NULL THEN
      RAISE EXCEPTION 'PARTNER_SOURCE_REQUIRES_BINDING_AND_SIZE' USING ERRCODE = 'P0001';
    END IF;

    SELECT b.warehouse_kind, b.partner_id
      INTO v_warehouse, v_partner_id
      FROM public.product_partner_bindings b
     WHERE b.id = p_source_binding_id
       AND b.deleted_at IS NULL;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'BINDING_NOT_FOUND' USING ERRCODE = 'P0002';
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

    SELECT id INTO v_session_reservation
      FROM public.size_reservations
     WHERE source_binding_id = p_source_binding_id
       AND size_text = p_size
       AND session_id = p_customer_id::TEXT
       AND source_kind = 'partner'
     LIMIT 1;

    IF v_session_reservation IS NOT NULL THEN
      DELETE FROM public.size_reservations WHERE id = v_session_reservation;
    ELSE
      IF v_current - v_reserved <= 0 THEN
        RAISE EXCEPTION 'OUT_OF_STOCK' USING ERRCODE = 'P0003';
      END IF;
      UPDATE public.product_partner_size_stock
         SET reserved_quantity = COALESCE(reserved_quantity, 0) + 1
       WHERE binding_id = p_source_binding_id
         AND size = p_size;
    END IF;

  ELSE
    RAISE EXCEPTION 'INVALID_SOURCE_KIND: %', p_source_kind USING ERRCODE = 'P0001';
  END IF;

  -- Применение баланса: для любых owner-source (и обычные, и +ВАЙБ).
  -- Для партнёрских (любой склад) — нельзя, это деньги владельца, и платить
  -- ими партнёру = платить из своего кармана.
  IF p_source_kind = 'owner' THEN
    SELECT customer_balance INTO v_balance
      FROM public.customers
     WHERE id = p_customer_id
     FOR UPDATE;

    IF v_balance > 0 THEN
      v_applied := LEAST(v_balance, p_client_price);
      v_remaining := p_client_price - v_applied;
      v_fully_paid := v_remaining <= 0;

      UPDATE public.customers
         SET customer_balance = customer_balance - v_applied
       WHERE id = p_customer_id
       RETURNING customer_balance INTO v_new_balance;

      INSERT INTO public.customer_balance_history (
        customer_id, delta, balance_after, reason, created_at
      ) VALUES (
        p_customer_id, -v_applied, v_new_balance, 'balance_apply', v_now
      );
    END IF;
  END IF;

  IF p_is_vibe_debt THEN
    v_expires_at := NULL;
  ELSE
    v_expires_at := v_now + make_interval(mins => p_ttl_minutes);
  END IF;

  INSERT INTO public.pending_orders (
    customer_id, product_id, product_size_id, partner_id,
    client_price, delivery_service, tracking_number, send_by,
    expires_at, applied_balance,
    source_kind, source_binding_id, source_partner_id, source_warehouse,
    is_vibe_debt
  ) VALUES (
    p_customer_id, p_product_id, p_product_size_id, v_partner_id,
    p_client_price, p_delivery_service, p_tracking_number, p_send_by,
    v_expires_at, v_applied,
    p_source_kind, p_source_binding_id, v_partner_id, v_warehouse,
    p_is_vibe_debt
  )
  RETURNING id INTO v_pending_id;

  RETURN QUERY SELECT v_pending_id, v_applied, v_fully_paid;
END;
$func$;

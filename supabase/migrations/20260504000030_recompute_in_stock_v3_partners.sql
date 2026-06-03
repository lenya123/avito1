-- recompute_product_in_stock v3: учитывает партнёрский сток через лестницу
-- (product_partner_bindings + product_partner_size_stock).
--
-- Пересчёт is_in_stock = ИСТИНА если:
--   (a) у владельца есть хоть один размер с current - reserved > 0  ИЛИ
--   (b) у партнёра-binding'а (не soft-deleted, partner.is_active,
--        для warehouse=partner — payment_requisites IS NOT NULL)
--        есть хоть один размер с current - reserved > 0.
--
-- Те же фильтры пригодности что в fetchPartnerStockMap (catalog бота)
-- и select_size_source RPC — то есть «доступно для продажи клиенту».
--
-- Зеркала current_quantity / reserved_quantity / purchase_quantity на products
-- остаются от owner-стока (для совместимости с legacy-читателями
-- shipper-API / отчётов). Партнёрский сток сюда не зеркалится — он у партнёра.
--
-- is_in_stock меняем только при реальном переходе значения, чтобы не
-- флипать trigger_product_arrival впустую.

CREATE OR REPLACE FUNCTION public.recompute_product_in_stock(p_product_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_current     INT;
  v_owner_reserved    INT;
  v_owner_initial     INT;
  v_owner_available   INT;
  v_partner_available INT;
  v_should_be_in_stock BOOLEAN;
  v_old_in_stock      BOOLEAN;
BEGIN
  SELECT
    COALESCE(SUM(current_quantity), 0),
    COALESCE(SUM(reserved_quantity), 0),
    COALESCE(SUM(initial_quantity), 0)
  INTO v_owner_current, v_owner_reserved, v_owner_initial
  FROM public.product_sizes
  WHERE product_id = p_product_id;

  v_owner_available := v_owner_current - v_owner_reserved;

  SELECT COALESCE(SUM(GREATEST(pss.current_quantity - COALESCE(pss.reserved_quantity, 0), 0)), 0)
  INTO v_partner_available
  FROM public.product_partner_size_stock pss
  JOIN public.product_partner_bindings ppb ON ppb.id = pss.binding_id
  JOIN public.partners pa ON pa.id = ppb.partner_id
  WHERE ppb.product_id = p_product_id
    AND ppb.deleted_at IS NULL
    AND pa.is_active = TRUE
    AND (
      ppb.warehouse_kind = 'owner'
      OR (ppb.warehouse_kind = 'partner' AND pa.payment_requisites IS NOT NULL)
    );

  v_should_be_in_stock := (v_owner_available > 0) OR (v_partner_available > 0);

  SELECT is_in_stock INTO v_old_in_stock FROM public.products WHERE id = p_product_id;

  UPDATE public.products
  SET
    current_quantity = v_owner_current,
    reserved_quantity = v_owner_reserved,
    purchase_quantity = GREATEST(v_owner_initial, COALESCE(purchase_quantity, 0)),
    is_in_stock = CASE
      WHEN v_old_in_stock IS DISTINCT FROM v_should_be_in_stock THEN v_should_be_in_stock
      ELSE is_in_stock
    END
  WHERE id = p_product_id;
END $$;

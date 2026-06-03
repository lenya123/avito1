-- Триггер на product_partner_bindings: при INSERT/UPDATE/DELETE пересчитываем
-- is_in_stock у соответствующего товара. Кейсы:
--   - INSERT нового binding'а с уже заполненным стоком (через UPSERT в API
--     PATCH /owner/products/[id]) → товар «оживает».
--   - UPDATE deleted_at IS NOT NULL (soft-delete binding'а) → если у владельца
--     сток нулевой и других binding'ов нет — товар становится «распродан».
--   - DELETE (хард-удаление) — то же.

CREATE OR REPLACE FUNCTION public.trg_partner_bindings_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
BEGIN
  v_product_id := COALESCE(NEW.product_id, OLD.product_id);
  IF v_product_id IS NOT NULL THEN
    PERFORM public.recompute_product_in_stock(v_product_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS partner_bindings_sync_in_stock ON public.product_partner_bindings;
CREATE TRIGGER partner_bindings_sync_in_stock
AFTER INSERT OR UPDATE OF deleted_at, partner_id, warehouse_kind OR DELETE
ON public.product_partner_bindings
FOR EACH ROW EXECUTE FUNCTION public.trg_partner_bindings_recompute();

-- Триггер на product_partner_size_stock: при INSERT/UPDATE/DELETE
-- пересчитываем is_in_stock у соответствующего товара (через binding).
-- Без этого триггера обнуление партнёрского стока не отражается на флаге
-- товара, и наоборот — добавление партнёрского стока не «оживляет»
-- товар у которого owner-сток нулевой.

CREATE OR REPLACE FUNCTION public.trg_partner_size_stock_recompute()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_id UUID;
  v_binding_id UUID;
BEGIN
  v_binding_id := COALESCE(NEW.binding_id, OLD.binding_id);
  SELECT product_id INTO v_product_id
    FROM public.product_partner_bindings
    WHERE id = v_binding_id;
  IF v_product_id IS NOT NULL THEN
    PERFORM public.recompute_product_in_stock(v_product_id);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS partner_size_stock_sync_in_stock ON public.product_partner_size_stock;
CREATE TRIGGER partner_size_stock_sync_in_stock
AFTER INSERT OR UPDATE OF current_quantity, reserved_quantity OR DELETE
ON public.product_partner_size_stock
FOR EACH ROW EXECUTE FUNCTION public.trg_partner_size_stock_recompute();

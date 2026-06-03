CREATE OR REPLACE FUNCTION public.cancel_pending_order_atomic(p_pending_order_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $func$
DECLARE
  v_size_id UUID;
BEGIN
  SELECT product_size_id INTO v_size_id
    FROM public.pending_orders
   WHERE id = p_pending_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  DELETE FROM public.pending_orders WHERE id = p_pending_order_id;

  UPDATE public.product_sizes
     SET reserved_quantity = GREATEST(0, COALESCE(reserved_quantity, 0) - 1)
   WHERE id = v_size_id;

  RETURN TRUE;
END;
$func$;

-- Простой инкремент orders_taken в shipper_stats на дату. Используется
-- из executeStartCollecting (paid → collecting). В отличие от
-- increment_shipper_stat — без бонусов/streak'ов/earnings, только
-- инкремент счётчика.
CREATE OR REPLACE FUNCTION public.increment_shipper_orders_taken(
  p_shipper_id UUID,
  p_date DATE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.shipper_stats (shipper_id, date, orders_taken)
  VALUES (p_shipper_id, p_date, 1)
  ON CONFLICT (shipper_id, date)
  DO UPDATE SET orders_taken = public.shipper_stats.orders_taken + 1;
END $$;

GRANT EXECUTE ON FUNCTION public.increment_shipper_orders_taken(UUID, DATE) TO service_role;

COMMENT ON FUNCTION public.increment_shipper_orders_taken IS
  'Walkthrough фазы 2 (#1): инкремент shipper_stats.orders_taken при start_collecting. Для KPI «процент успешных отправок» в /owner/shippers/[id].';

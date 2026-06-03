-- Backfill is_in_stock с учётом партнёрского стока. Прогоняем
-- recompute_product_in_stock для всех продуктов; функция сама пропустит
-- продукты у которых флаг уже совпадает с расчётом.
--
-- session_replication_role = 'replica' отключает пользовательские триггеры
-- на время backfill'а — иначе trigger_product_arrival разошлёт push'и
-- «товар вернулся в наличие» по всем партнёрским stock-сайтам.

BEGIN;

SET LOCAL session_replication_role = 'replica';

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.products LOOP
    PERFORM public.recompute_product_in_stock(r.id);
  END LOOP;
END $$;

SET LOCAL session_replication_role = 'origin';

COMMIT;

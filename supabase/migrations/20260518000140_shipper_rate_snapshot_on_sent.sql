-- §9.4 — разблокировка вычета ставки отправщика из прибыли (часть C).
-- При переходе заказа в sent снапшотим ставку отправщика «на сейчас» в
-- orders.shipper_rate_snapshot (колонка существует с 20260414000011, но
-- НЕ заполнялась — executeShip хардкодил null с TODO «Этап 7»).
--
-- Триггер — единый источник правды: покрывает все пути отгрузки
-- (executeShip, batch-ship, owner-manual sent). При undo (sent → не-sent)
-- снимаем снапшот. Идемпотентен: заполняем только если ещё null.
--
-- shipper_current_rate() (миграция ..010) сама разруливает режим
-- (fixed → fixed_rate; pendulum → rate по shipper_score) и NULL-отправщика.

CREATE OR REPLACE FUNCTION public.orders_snapshot_shipper_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    IF NEW.shipper_rate_snapshot IS NULL THEN
      NEW.shipper_rate_snapshot :=
        public.shipper_current_rate(COALESCE(NEW.shipped_by, NEW.claimed_by));
    END IF;
  ELSIF NEW.status IS DISTINCT FROM 'sent' AND OLD.status = 'sent' THEN
    -- Откат отгрузки — снимок недействителен.
    NEW.shipper_rate_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_snapshot_shipper_rate ON public.orders;

CREATE TRIGGER trg_orders_snapshot_shipper_rate
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_snapshot_shipper_rate();

COMMENT ON FUNCTION public.orders_snapshot_shipper_rate IS
  'BEFORE UPDATE OF status на orders: при переходе в sent фиксирует orders.shipper_rate_snapshot = shipper_current_rate(исполнитель) если ещё пуст; при откате из sent снимает снимок. Разблокирует §9.4 (прибыль − ставка отправщика).';

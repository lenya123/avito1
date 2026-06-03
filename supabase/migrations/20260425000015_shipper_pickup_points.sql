-- Stage 2.5 — Каркас ПВЗ-адресов отправщика (полный UI — Stage 7).
--
-- Отправщик держит список ПВЗ по каждой службе доставки. При отправке
-- заказа выбирает нужный ПВЗ → snapshot-поля на orders фиксируют адрес,
-- чтобы история заказа оставалась осмысленной при архивации ПВЗ.
--
-- orders.pickup_point_id уже была как VARCHAR/TEXT в старой схеме, но без FK
-- и без snapshot. Пересобираем корректно: новая UUID-колонка + snapshot.

CREATE TABLE IF NOT EXISTS public.shipper_pickup_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shipper_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  delivery_service TEXT NOT NULL CHECK (delivery_service IN
    ('avito', 'yandex', 'cdek', 'pochta', 'boxberry', '5post')),
  label VARCHAR(100) NOT NULL,             -- "ПВЗ ул. Ленина 5"
  address_text TEXT NOT NULL,              -- полный адрес
  code VARCHAR(50),                        -- код ПВЗ у провайдера (опц.)
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipper_pickup_points_shipper
  ON public.shipper_pickup_points(shipper_id);
CREATE INDEX IF NOT EXISTS idx_shipper_pickup_points_active
  ON public.shipper_pickup_points(shipper_id, delivery_service)
  WHERE is_archived = FALSE;

ALTER TABLE public.shipper_pickup_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY pickup_points_owner_all ON public.shipper_pickup_points
  FOR ALL TO authenticated
  USING (public.is_owner())
  WITH CHECK (public.is_owner());

CREATE POLICY pickup_points_shipper_own ON public.shipper_pickup_points
  FOR ALL TO authenticated
  USING (public.is_shipper() AND shipper_id = auth.uid())
  WITH CHECK (public.is_shipper() AND shipper_id = auth.uid());

-- ===== Связь с orders =====
--
-- Старая orders.pickup_point_id ссылалась на общий каталог pickup_points
-- (legacy, неиспользуемый в новой модели). Обнуляем и переподключаем FK
-- к новой shipper_pickup_points. Существующие тестовые заказы pickup_point_id
-- не используют.

UPDATE public.orders SET pickup_point_id = NULL WHERE pickup_point_id IS NOT NULL;

ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_pickup_point_id_fkey;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_pickup_point_id_fkey
  FOREIGN KEY (pickup_point_id)
  REFERENCES public.shipper_pickup_points(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS pickup_point_label_snapshot VARCHAR(100),
  ADD COLUMN IF NOT EXISTS pickup_point_address_snapshot TEXT;

-- Триггер snapshot ПВЗ.
CREATE OR REPLACE FUNCTION public.orders_snapshot_pickup_point()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pickup_point_id IS NOT NULL THEN
    SELECT label, address_text
      INTO NEW.pickup_point_label_snapshot, NEW.pickup_point_address_snapshot
      FROM public.shipper_pickup_points
      WHERE id = NEW.pickup_point_id;
  ELSE
    NEW.pickup_point_label_snapshot := NULL;
    NEW.pickup_point_address_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_snapshot_pickup_point ON public.orders;
CREATE TRIGGER trg_orders_snapshot_pickup_point
  BEFORE INSERT OR UPDATE OF pickup_point_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_snapshot_pickup_point();

COMMENT ON TABLE public.shipper_pickup_points IS
  'ПВЗ отправщика по службам доставки. Архивные остаются видимы через snapshot на заказах.';

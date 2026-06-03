-- Stage 2.2 — Миграция orders.client_id → orders.customer_id + snapshot.
--
-- Атомарная одношаговая замена: в проде заказов реальных клиентов ещё нет
-- (customer-bot не зарелизен), поэтому сначала чистим placeholder-записи,
-- потом меняем колонки. CASCADE снимает старый FK и политики/RPC, если
-- они до сих пор ссылаются на client_id.
--
-- Snapshot-поля (customer_name_snapshot, customer_tg_username_snapshot)
-- нужны чтобы shipper-PWA могло рендерить имя клиента на этикетках
-- без JOIN на customers (shipper не имеет доступа к customers через RLS).

-- 1. Чистим тестовые placeholder-заказы клиентов (role='client').
DELETE FROM public.orders o
WHERE o.client_id IN (SELECT u.id FROM public.users u WHERE u.role = 'client');

-- 2. Снимаем FK и колонку.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_client_id_fkey CASCADE;

ALTER TABLE public.orders
  DROP COLUMN IF EXISTS client_id CASCADE;

-- 3. Новая колонка customer_id (nullable — ручные заказы отправщика не имеют клиента).
ALTER TABLE public.orders
  ADD COLUMN customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL;

-- 4. Snapshot-поля для shipper.
ALTER TABLE public.orders
  ADD COLUMN customer_name_snapshot VARCHAR(255),
  ADD COLUMN customer_tg_username_snapshot VARCHAR(64);

-- 5. Индекс.
CREATE INDEX IF NOT EXISTS idx_orders_customer ON public.orders(customer_id);

-- 6. Триггер автозаполнения snapshot при INSERT/UPDATE customer_id.
CREATE OR REPLACE FUNCTION public.orders_snapshot_customer()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.customer_id IS NOT NULL THEN
    SELECT c.name, c.telegram_username
      INTO NEW.customer_name_snapshot, NEW.customer_tg_username_snapshot
      FROM public.customers c
      WHERE c.id = NEW.customer_id;
  ELSE
    NEW.customer_name_snapshot := NULL;
    NEW.customer_tg_username_snapshot := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_snapshot_customer ON public.orders;
CREATE TRIGGER trg_orders_snapshot_customer
  BEFORE INSERT OR UPDATE OF customer_id ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.orders_snapshot_customer();

COMMENT ON COLUMN public.orders.customer_id IS
  'FK на customers. NULL для ручных заказов отправщика (нет клиента).';
COMMENT ON COLUMN public.orders.customer_name_snapshot IS
  'Snapshot имени клиента на момент создания/обновления — для shipper-этикеток без JOIN.';
COMMENT ON COLUMN public.orders.customer_tg_username_snapshot IS
  'Snapshot Telegram @username клиента — для shipper-этикеток без JOIN.';

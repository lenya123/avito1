-- M2: Снапшот комиссии платформы на уровне заказа
-- fee_pct_snapshot фиксирует ставку в момент создания заказа
-- platform_fee_amount = ROUND(client_price * fee_pct / 100, 2)
-- seller_net_amount = client_price - platform_fee - shipper_rate - acquiring_fee

-- 1. Новые колонки
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS fee_pct_snapshot NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS platform_fee_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS acquiring_fee_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS seller_net_amount NUMERIC(12,2);

-- 2. Backfill для существующих заказов (ставка 5%)
UPDATE public.orders
   SET fee_pct_snapshot = 5.00,
       platform_fee_amount = ROUND(client_price * 0.05, 2),
       seller_net_amount = client_price
         - ROUND(client_price * 0.05, 2)
         - COALESCE(shipper_rate_snapshot, 0)
 WHERE fee_pct_snapshot IS NULL
   AND client_price IS NOT NULL;

-- Для заказов без client_price (не должно быть, но safe)
UPDATE public.orders
   SET fee_pct_snapshot = 5.00,
       platform_fee_amount = 0,
       seller_net_amount = 0
 WHERE fee_pct_snapshot IS NULL;

ALTER TABLE public.orders
  ALTER COLUMN fee_pct_snapshot SET NOT NULL,
  ALTER COLUMN fee_pct_snapshot SET DEFAULT 0;

ALTER TABLE public.orders
  ALTER COLUMN platform_fee_amount SET NOT NULL,
  ALTER COLUMN platform_fee_amount SET DEFAULT 0;

-- seller_net_amount и acquiring_fee_amount остаются nullable:
-- acquiring_fee заполняется из ЮKassa в Фазе 4
-- seller_net может быть null для старых заказов без client_price

-- 3. Триггер: snapshot комиссии при INSERT + пересчёт при UPDATE client_price
CREATE OR REPLACE FUNCTION public.orders_fee_snapshot_trg()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pct NUMERIC(5,2);
  v_is_main BOOLEAN;
BEGIN
  -- При INSERT: определяем ставку из settings (или 0 для main-seller)
  IF TG_OP = 'INSERT' AND NEW.fee_pct_snapshot IS NULL THEN
    SELECT COALESCE(u.linked_owner_id IS NOT NULL, FALSE)
      INTO v_is_main
      FROM public.users u
     WHERE u.id = NEW.seller_id;

    IF v_is_main THEN
      NEW.fee_pct_snapshot := 0;
    ELSE
      SELECT platform_commission_pct INTO v_pct FROM public.settings LIMIT 1;
      NEW.fee_pct_snapshot := COALESCE(v_pct, 5);
    END IF;
  END IF;

  -- Пересчёт сумм при любом изменении client_price или fee_pct
  IF NEW.client_price IS NOT NULL THEN
    NEW.platform_fee_amount := ROUND(NEW.client_price * NEW.fee_pct_snapshot / 100, 2);
    NEW.seller_net_amount := NEW.client_price
      - NEW.platform_fee_amount
      - COALESCE(NEW.shipper_rate_snapshot, 0)
      - COALESCE(NEW.acquiring_fee_amount, 0);
  END IF;

  RETURN NEW;
END $$;

CREATE TRIGGER orders_fee_snapshot_biu
  BEFORE INSERT OR UPDATE OF client_price, fee_pct_snapshot, shipper_rate_snapshot, acquiring_fee_amount
  ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_fee_snapshot_trg();

-- 4. Индекс для финансовых запросов
CREATE INDEX IF NOT EXISTS orders_seller_completed_idx
  ON public.orders (seller_id, completed_at DESC)
  WHERE status = 'completed';

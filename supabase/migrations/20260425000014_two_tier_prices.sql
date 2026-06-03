-- Stage 2.5 — Двухуровневые цены: обычная + для "топов".
--
-- Логика: если клиент customers.is_top=TRUE и у товара задан drop_price_top —
-- клиенту цитируется drop_price_top. Иначе fallback на обычную drop_price.
-- Выбор цены — в коде оформления заказа (Stage 3 / src/utils/pricing.ts).

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS drop_price_top NUMERIC(12, 2) CHECK (drop_price_top IS NULL OR drop_price_top > 0);

COMMENT ON COLUMN public.products.drop_price_top IS
  'Оптовая цена для клиентов с customers.is_top=TRUE. NULL → fallback на drop_price.';

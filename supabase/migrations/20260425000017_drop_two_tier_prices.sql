-- Stage 2 — откат двухуровневой ценовой модели.
--
-- Бизнес-решение: все клиенты едины, одна цена для всех. Колонки
-- products.drop_price_top (мигр. 20260425000014) и customers.is_top
-- (мигр. 20260425000003) удаляются полностью.

ALTER TABLE public.products DROP COLUMN IF EXISTS drop_price_top;

DROP INDEX IF EXISTS public.idx_customers_top;

ALTER TABLE public.customers DROP COLUMN IF EXISTS is_top;

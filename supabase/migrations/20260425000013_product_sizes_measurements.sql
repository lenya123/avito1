-- Stage 2.5 — Замеры с products перенесены на product_sizes.
--
-- Причина: замеры различаются по размеру (длина рукава у XS != XXL).
-- "One Size" поддерживается записью в product_sizes со значением 'one size'.

-- 1. Новая колонка на product_sizes.
ALTER TABLE public.product_sizes ADD COLUMN IF NOT EXISTS measurements JSONB;

-- 2. Бэкфилл: если у товара были общие замеры — копируем в каждую размерную строку.
UPDATE public.product_sizes ps
  SET measurements = p.measurements
  FROM public.products p
  WHERE ps.product_id = p.id
    AND p.measurements IS NOT NULL
    AND ps.measurements IS NULL;

-- 3. Дропаем старое поле на products.
ALTER TABLE public.products DROP COLUMN IF EXISTS measurements;

COMMENT ON COLUMN public.product_sizes.measurements IS
  'Замеры для конкретного размера. JSONB — произвольные пары ключ/значение (объём груди, длина рукава, ...).';

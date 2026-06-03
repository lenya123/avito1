-- Партии закупок (журнал, Вариант А — НЕ FIFO).
-- Каждая партия = запись о закупке: дата, цена, размеры/количества.
-- Остатки по размерам со всех партий группируются в одно число
-- (product_sizes.current_quantity, как и раньше). Партии — источник
-- правды для «всего закуплено» и СРЕДНЕВЗВЕШЕННОЙ закупочной цены
-- (products.purchase_quantity / products.purchase_price пересчитываются
-- из партий). Деньги/прибыль/₽-недостача ядро НЕ меняют — продолжают
-- читать products.purchase_price (теперь = средняя по партиям).
-- Канон §11.5.
--
-- sizes jsonb = [{"size_id": uuid, "size": text, "quantity": int}].

CREATE TABLE public.product_batches (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  batch_number   INT NOT NULL,
  purchase_price NUMERIC NOT NULL DEFAULT 0,
  sizes          JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_batches_product ON public.product_batches(product_id);

CREATE UNIQUE INDEX idx_product_batches_num
  ON public.product_batches(product_id, batch_number);

COMMENT ON TABLE public.product_batches IS
  'Журнал партий закупок (Вариант А, не FIFO). Источник правды для «всего закуплено» и средневзвешенной закупочной. Остаток по размерам — единый пул в product_sizes.';

-- Backfill: каждому существующему товару — «Партия 1» из текущих чисел
-- (цена = products.purchase_price, размеры/кол-во = initial_quantity).
INSERT INTO public.product_batches (product_id, batch_number, purchase_price, sizes, created_at)
SELECT
  p.id,
  1,
  COALESCE(p.purchase_price, 0),
  COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'size_id', ps.id,
          'size', ps.size,
          'quantity', ps.initial_quantity
        )
      )
      FROM public.product_sizes ps
      WHERE ps.product_id = p.id
    ),
    '[]'::jsonb
  ),
  COALESCE(p.created_at, now())
FROM public.products p
WHERE NOT EXISTS (
  SELECT 1 FROM public.product_batches b WHERE b.product_id = p.id
);

-- Учёт недостач/излишков склада (решение 2026-05-16).
--
-- Модель: «потеря» НЕ выводится формулой (initial−продано−остаток ломается
-- при ресток/возвратах). Источник правды — сверка инвентаризации: когда
-- отправщик физически пересчитал размер и факт ≠ системный current,
-- пишется событие сюда + current авто-сверяется к факту (факт — истина).
--
-- delta = system_before − counted:
--   > 0  — недостача (система думала больше, чем есть физически),
--   < 0  — излишек (нашли больше; неучтённый возврат / прошлый недосчёт).
--
-- Ручная правка остатка владельцем и §11 «нет товара» сюда НЕ пишутся —
-- только независимый физический пересчёт отправщика.
CREATE TABLE public.stock_reconciliations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  product_size_id UUID REFERENCES public.product_sizes(id) ON DELETE SET NULL,
  size TEXT,
  system_before INT NOT NULL,
  counted INT NOT NULL,
  delta INT NOT NULL,
  purchase_price_snapshot NUMERIC NOT NULL DEFAULT 0,
  reconciled_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_recon_product ON public.stock_reconciliations(product_id);

CREATE INDEX idx_stock_recon_created ON public.stock_reconciliations(created_at DESC);

COMMENT ON TABLE public.stock_reconciliations IS
  'Аудит сверок инвентаризации: расхождение системного остатка и физ. факта. delta>0 недостача, <0 излишек. Пишется только при инвентаризации отправщика (авто-сверка current:=факт).';

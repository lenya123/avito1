-- payment_method_id на pending_orders + orders (FK → payment_methods).
-- Нужно для бампа payment_method_month_stats при confirm — без этого
-- ступенчатая ротация и месячные лимиты карт не работают для не-+ВАЙБ
-- заказов (legacy trigger живёт только на vibe_payments).

ALTER TABLE public.pending_orders
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_method_id UUID REFERENCES public.payment_methods(id) ON DELETE SET NULL;

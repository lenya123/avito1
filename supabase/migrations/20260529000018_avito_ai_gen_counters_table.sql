-- Дневной лимит AI-генераций на товар: 2 normal + 2 photozone + 1 personality (=5/день).
-- Сброс — естественный (новая строка на новый московский день, gen_date).
CREATE TABLE IF NOT EXISTS avito_ai_gen_counters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  product_id uuid NOT NULL REFERENCES public.products(id),
  gen_date date NOT NULL,
  category text NOT NULL,
  used_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (product_id, gen_date, category)
);

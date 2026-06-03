-- Формализация рантайм-таблицы avito_post_jobs (создавалась напрямую в БД).
-- Идемпотентно: на проде no-op. Форма — по src/types/database.generated.ts.
CREATE TABLE IF NOT EXISTS avito_post_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  session_id uuid NOT NULL REFERENCES public.avito_browser_sessions(id),
  product_id uuid REFERENCES public.products(id),
  title text NOT NULL,
  description text,
  price numeric NOT NULL,
  city text NOT NULL DEFAULT 'Москва',
  metro text,
  status text NOT NULL DEFAULT 'queued',
  attempts int NOT NULL DEFAULT 0,
  photo_plan jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  avito_item_id text,
  avito_item_url text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

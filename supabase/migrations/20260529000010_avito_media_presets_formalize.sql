-- Формализация рантайм-таблицы avito_media_presets (создавалась напрямую в БД,
-- не была закоммичена в миграции). Идемпотентно: на проде no-op.
-- Форма колонок — строго по src/types/database.generated.ts.
CREATE TABLE IF NOT EXISTS avito_media_presets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  kind text NOT NULL,
  set_key text,
  storage_path text NOT NULL,
  public_url text,
  source text NOT NULL DEFAULT 'manual',
  product_id uuid REFERENCES public.products(id),
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

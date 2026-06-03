-- Единица лестницы для живых фотосетов: счётчик держим на СЕТЕ (set_key),
-- а не размазываем по 9 строкам avito_media_presets(kind='photoset').
CREATE TABLE IF NOT EXISTS avito_photoset_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.users(id),
  set_key text NOT NULL,
  title text,
  photo_count int NOT NULL DEFAULT 0,
  usage_count int NOT NULL DEFAULT 0,
  last_used_at timestamptz,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, set_key)
);

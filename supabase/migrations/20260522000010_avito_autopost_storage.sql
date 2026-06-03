-- Avito Autopost: Storage buckets для:
-- 1. avito-autopost — финальные обработанные фото (генерируется автопостингом)
-- 2. avito-covers — пресеты обложек (загружает владелец вручную)
-- 3. avito-photosets — пресеты фотосетов по категориям (загружает владелец)
--
-- Доступ к buckets — только service role (приватные).
-- Публичные URL формируются через getPublicUrl() при необходимости.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('avito-autopost', 'avito-autopost', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('avito-covers',   'avito-covers',   true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('avito-photosets','avito-photosets',true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

-- RLS политики (только владелец читает/пишет в buckets)
DROP POLICY IF EXISTS "avito_autopost_owner_only" ON storage.objects;
CREATE POLICY "avito_autopost_owner_only" ON storage.objects FOR ALL
  USING (
    bucket_id IN ('avito-autopost', 'avito-covers', 'avito-photosets')
    AND EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner')
  );

-- Таблица для метаданных пресетов фотосетов (по категориям)
CREATE TABLE IF NOT EXISTS avito_photoset_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL, -- "одежда", "обувь", "электроника" и т.д.
  name TEXT NOT NULL,     -- название набора, например "уличный фотосет"
  photo_urls TEXT[] NOT NULL DEFAULT '{}', -- URLs из storage bucket
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avito_photoset_presets_category_idx ON avito_photoset_presets(category);

ALTER TABLE avito_photoset_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avito_photoset_presets_owner" ON avito_photoset_presets;
CREATE POLICY "avito_photoset_presets_owner" ON avito_photoset_presets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner'));

-- Аналогично для обложек (живые с инета)
CREATE TABLE IF NOT EXISTS avito_cover_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  photo_url TEXT NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS avito_cover_presets_category_idx ON avito_cover_presets(category);

ALTER TABLE avito_cover_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "avito_cover_presets_owner" ON avito_cover_presets;
CREATE POLICY "avito_cover_presets_owner" ON avito_cover_presets FOR ALL
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role = 'owner'));

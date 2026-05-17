-- Добавляем поле avatar_url в таблицу users
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Storage bucket для аватарок (публичный для чтения)
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;

-- Политика: публичное чтение аватарок
CREATE POLICY "Public read avatars" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

-- Политика: загрузка аватарок (service role обходит RLS, но нужны для полноты)
CREATE POLICY "Service upload avatars" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Service update avatars" ON storage.objects
  FOR UPDATE USING (bucket_id = 'avatars');

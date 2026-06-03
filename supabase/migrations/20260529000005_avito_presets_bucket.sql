-- Бакет для медиа-библиотеки автопостинга (avito_media_presets + AI-pending).
-- Приватный: доступ только через service_role (приложение/воркер скачивают
-- по storage.download / signed URL). Идемпотентно.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avito-presets', 'avito-presets', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

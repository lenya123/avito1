-- Лестница: момент последнего использования (тай-брейк при равных usage_count).
ALTER TABLE avito_media_presets ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

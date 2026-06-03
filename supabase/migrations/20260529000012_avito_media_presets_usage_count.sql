-- Лестница: счётчик использований превью/обложки (наименее использованное — вперёд).
ALTER TABLE avito_media_presets ADD COLUMN IF NOT EXISTS usage_count int NOT NULL DEFAULT 0;

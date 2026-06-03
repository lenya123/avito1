-- pHash'и опубликованных версий пресета (avoidHashes): уникализатор отстраивает новую
-- выкладку не только от исходника, но и от прошлых выкладок этого же фото, чтобы Avito
-- не склеивал две выкладки одного фотосета. Массив строк-хешей (последние ~20).
ALTER TABLE avito_media_presets ADD COLUMN IF NOT EXISTS published_phashes jsonb NOT NULL DEFAULT '[]'::jsonb;

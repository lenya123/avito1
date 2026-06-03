-- Категория источника обложки для ручного выбора: normal | photozone | personality | live
-- (4 категории в модалке). Заполняется при апруве AI-генерации и при загрузке живой обложки.
ALTER TABLE avito_media_presets ADD COLUMN IF NOT EXISTS gen_category text;
